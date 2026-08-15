/**
 * Zero-touch Deploy pipeline
 * --------------------------
 * Trigger: dashboard "Deploy" → POST /functions/v1/provision-client
 *
 * Sequence:
 *  1. Auth + ownership checks
 *  2. Idempotent provision_jobs row
 *  3. License / wallet validation (RPC reserve_deploy_license)
 *  4. Domain registration (Namecheap / ResellerClub / mock)
 *  5. Cloudflare DNS A/CNAME + SSL (Universal / Custom Hostname ACME)
 *  6. Tenant handshake → Repo 1 or Repo 2
 *  7. Persist credentials + mark client active
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";
import { purchaseDomain } from "../_shared/registrar.ts";
import {
  initiateSsl,
  initiateSslMock,
  upsertTenantDns,
  upsertTenantDnsMock,
} from "../_shared/cloudflare.ts";
import { provisionTenant } from "../_shared/tenantHandshake.ts";

type DeployBody = {
  client_id: string;
  purchase_domain?: boolean;
  years?: number;
};

type StepRecord = {
  step: string;
  status: "ok" | "error" | "skipped";
  at: string;
  detail?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: DeployBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.client_id) {
    return jsonResponse({ error: "client_id is required" }, 400);
  }

  const idempotencyKey =
    req.headers.get("x-idempotency-key") ??
    `deploy:${body.client_id}:${new Date().toISOString().slice(0, 13)}`;

  const userClient = createUserClient(authHeader);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createServiceClient();
  const steps: StepRecord[] = [];

  const pushStep = async (
    jobId: string,
    step: StepRecord["step"],
    status: StepRecord["status"],
    detail?: unknown,
  ) => {
    const rec: StepRecord = { step, status, at: new Date().toISOString(), detail };
    steps.push(rec);
    await admin
      .from("provision_jobs")
      .update({ current_step: step, steps, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  };

  try {
    // Resolve distributor for caller
    const { data: distributor, error: distErr } = await admin
      .from("distributors")
      .select("id, status, profile_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (distErr || !distributor) {
      return jsonResponse({ error: "Distributor profile not found" }, 403);
    }
    if (distributor.status !== "active") {
      return jsonResponse({ error: "Distributor is not active" }, 403);
    }

    const { data: client, error: clientErr } = await admin
      .from("clients")
      .select("*, products(*)")
      .eq("id", body.client_id)
      .eq("distributor_id", distributor.id)
      .single();

    if (clientErr || !client) {
      return jsonResponse({ error: "Client not found for this distributor" }, 404);
    }

    if (["active", "provisioning"].includes(client.status)) {
      // Return existing successful/running job if idempotent retry
      const { data: existing } = await admin
        .from("provision_jobs")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ job: existing, client_id: client.id, reused: true });
      }
    }

    // Upsert idempotent job
    const { data: job, error: jobErr } = await admin
      .from("provision_jobs")
      .upsert(
        {
          client_id: client.id,
          distributor_id: distributor.id,
          status: "running",
          current_step: "wallet_validation",
          idempotency_key: idempotencyKey,
          attempt_count: 1,
          steps: [],
          started_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "idempotency_key" },
      )
      .select("*")
      .single();

    if (jobErr || !job) {
      return jsonResponse({ error: "Failed to create provision job", detail: jobErr }, 500);
    }

    // If a prior job already succeeded for this key, short-circuit
    if (job.status === "succeeded") {
      return jsonResponse({ job, client_id: client.id, reused: true });
    }

    await admin
      .from("clients")
      .update({ status: "provisioning", provision_error: null })
      .eq("id", client.id);

    // ---- 1) License & wallet validation ----
    const { data: reserve, error: reserveErr } = await admin.rpc("reserve_deploy_license", {
      p_distributor_id: distributor.id,
      p_client_id: client.id,
      p_product_id: client.product_id,
      p_actor: user.id,
    });

    if (reserveErr) {
      await failJob(admin, job.id, client.id, "wallet_validation", reserveErr.message, steps);
      return jsonResponse({ error: reserveErr.message }, 402);
    }
    await pushStep(job.id, "wallet_validation", "ok", reserve?.[0] ?? reserve);
    await pushStep(job.id, "license_debit", "ok", reserve?.[0] ?? reserve);

    // ---- 2) Domain registration ----
    let domain = client.custom_domain as string | null;
    if (body.purchase_domain && domain) {
      await admin.from("clients").update({ domain_status: "purchasing" }).eq("id", client.id);
      const purchase = await purchaseDomain(domain, body.years ?? 1);
      await pushStep(job.id, "domain_registration", "ok", purchase);
      await admin
        .from("clients")
        .update({ domain_status: "purchased", metadata: { ...(client.metadata ?? {}), domain_order: purchase } })
        .eq("id", client.id);
    } else {
      await pushStep(job.id, "domain_registration", "skipped", {
        reason: body.purchase_domain ? "no custom_domain on client" : "purchase_domain=false",
      });
    }

    // ---- 3) Cloudflare DNS + SSL ----
    if (domain) {
      await admin.from("clients").update({ domain_status: "dns_pending" }).eq("id", client.id);

      const allowMock = Deno.env.get("ALLOW_MOCK_INTEGRATIONS") === "true";
      const hasCf = Boolean(Deno.env.get("CLOUDFLARE_API_TOKEN"));

      const dns = hasCf
        ? await upsertTenantDns(domain)
        : allowMock
          ? await upsertTenantDnsMock(domain)
          : (() => {
            throw new Error("CLOUDFLARE_API_TOKEN missing");
          })();

      await pushStep(job.id, "dns_setup", "ok", dns);

      await admin
        .from("clients")
        .update({
          domain_status: "ssl_pending",
          cloudflare_zone_id: dns.zoneId,
          cloudflare_record_ids: dns.recordIds,
        })
        .eq("id", client.id);

      const ssl = hasCf
        ? await initiateSsl(domain, dns.zoneId)
        : await initiateSslMock(domain);

      await pushStep(job.id, "ssl_init", "ok", ssl);
      await admin
        .from("clients")
        .update({ domain_status: "live", ssl_status: String(ssl.mode) })
        .eq("id", client.id);
    } else {
      await pushStep(job.id, "dns_setup", "skipped");
      await pushStep(job.id, "ssl_init", "skipped");
    }

    // ---- 4) Tenant provisioning handshake (Repo 1 / Repo 2) ----
    const product = client.products as {
      sku: string;
      provision_base_url: string | null;
      metadata: Record<string, unknown>;
    };

    const tenant = await provisionTenant(product, {
      clientId: client.id,
      distributorId: distributor.id,
      productSku: product.sku,
      displayName: client.display_name,
      slug: client.slug,
      customDomain: domain,
    });

    await pushStep(job.id, "tenant_handshake", "ok", {
      externalTenantId: tenant.externalTenantId,
      accessUrl: tenant.accessUrl,
      adminEmail: tenant.adminEmail,
      // Never persist raw password in step log if you can avoid it; kept for bootstrap demo
    });

    // ---- 5) Finalize ----
    const credentialsPayload = {
      admin_email: tenant.adminEmail,
      temporary_password: tenant.temporaryPassword ?? null,
      access_url: tenant.accessUrl,
      issued_at: new Date().toISOString(),
    };

    await admin
      .from("clients")
      .update({
        status: "active",
        external_tenant_id: tenant.externalTenantId,
        credentials_payload: credentialsPayload,
        activated_at: new Date().toISOString(),
        provision_error: null,
      })
      .eq("id", client.id);

    await pushStep(job.id, "finalize", "ok");

    const { data: finished } = await admin
      .from("provision_jobs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        steps,
        last_error: null,
      })
      .eq("id", job.id)
      .select("*")
      .single();

    return jsonResponse({
      ok: true,
      job: finished,
      client_id: client.id,
      credentials: credentialsPayload,
      debit: reserve?.[0] ?? reserve,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("provision-client failed", message);
    return jsonResponse({ error: message }, 500);
  }
});

async function failJob(
  admin: ReturnType<typeof createServiceClient>,
  jobId: string,
  clientId: string,
  step: string,
  message: string,
  steps: StepRecord[],
) {
  steps.push({ step, status: "error", at: new Date().toISOString(), detail: message });
  await admin
    .from("provision_jobs")
    .update({
      status: "failed",
      current_step: step,
      last_error: message,
      steps,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  await admin
    .from("clients")
    .update({ status: "failed", provision_error: message })
    .eq("id", clientId);
}
