/**
 * Zero-touch Deploy pipeline
 * --------------------------
 * Trigger: dashboard "Deploy" → POST /functions/v1/provision-client
 *
 * Sequence:
 *  1. Auth + ownership checks
 *  2. Idempotent provision_jobs row
 *  3. License / wallet validation (RPC reserve_deploy_license)
 *  4. Domain: managed portal or self-serve custom (no platform registrar purchase)
 *  5. Cloudflare DNS A/CNAME + SSL (Universal / Custom Hostname ACME)
 *  6. Tenant handshake → Repo 1 or Repo 2
 *  7. Persist credentials + mark client active
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { notifyProfiles } from "../_shared/notify.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";
import {
  initiateSsl,
  initiateSslMock,
  upsertTenantDns,
  upsertTenantDnsMock,
} from "../_shared/cloudflare.ts";
import { ensureManagedTenantDns } from "../_shared/netlifyDns.ts";
import { provisionTenant } from "../_shared/tenantHandshake.ts";

type DeployBody = {
  client_id: string;
  purchase_domain?: boolean;
  years?: number;
  force?: boolean;
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
    `deploy:${body.client_id}:${Date.now()}`;

  const userClient = createUserClient(authHeader);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createServiceClient();
  const steps: StepRecord[] = [];
  let activeJobId: string | null = null;
  let activeClientId: string | null = body.client_id ?? null;

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
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const isAdmin = profile?.role === "platform_admin";

    // Resolve caller's distributor workspace (master also has one)
    const { data: callerDistributor, error: distErr } = await admin
      .from("distributors")
      .select("id, status, profile_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!isAdmin && (distErr || !callerDistributor)) {
      return jsonResponse({ error: "Distributor profile not found" }, 403);
    }
    if (!isAdmin && callerDistributor!.status !== "active") {
      return jsonResponse({ error: "Distributor is not active" }, 403);
    }

    // Load client; distributors can only deploy their own, master can deploy any
    let clientQuery = admin
      .from("clients")
      .select("*, products!clients_product_id_fkey(*)")
      .eq("id", body.client_id);

    if (!isAdmin) {
      clientQuery = clientQuery.eq("distributor_id", callerDistributor!.id);
    }

    const { data: client, error: clientErr } = await clientQuery.maybeSingle();

    if (clientErr || !client) {
      return jsonResponse({ error: "Client not found for this distributor" }, 404);
    }
    activeClientId = client.id;

    const { data: distributor, error: ownerDistErr } = await admin
      .from("distributors")
      .select("id, status, profile_id")
      .eq("id", client.distributor_id)
      .maybeSingle();

    if (ownerDistErr || !distributor) {
      return jsonResponse({ error: "Owning distributor not found" }, 404);
    }
    if (distributor.status !== "active") {
      return jsonResponse({ error: "Owning distributor is not active" }, 403);
    }

    // Already live with a real product tenant — return last success
    const externalId = String(client.external_tenant_id ?? "");
    const needsReprovision =
      !externalId ||
      externalId.startsWith("pending-") ||
      externalId.startsWith("mock-tenant-");

    if (client.status === "active" && !needsReprovision && !body.force) {
      const { data: existing } = await admin
        .from("provision_jobs")
        .select("*")
        .eq("client_id", client.id)
        .eq("status", "succeeded")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return jsonResponse({
        ok: true,
        reused: true,
        client_id: client.id,
        credentials: client.credentials_payload,
        job: existing,
      });
    }

    // Clear stuck / pending so Deploy can create a real product tenant
    if (client.status === "provisioning" || (client.status === "active" && needsReprovision)) {
      await admin
        .from("clients")
        .update({ status: "draft", provision_error: null })
        .eq("id", client.id);
      await admin
        .from("provision_jobs")
        .update({
          status: "failed",
          last_error: "Superseded by new Deploy attempt",
          finished_at: new Date().toISOString(),
        })
        .eq("client_id", client.id)
        .eq("status", "running");
    }

    // Upsert idempotent job (unique key per attempt from client)
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
    activeJobId = job.id;

    // If a prior job already succeeded for this key, short-circuit
    if (job.status === "succeeded") {
      return jsonResponse({ job, client_id: client.id, reused: true });
    }

    await admin
      .from("clients")
      .update({ status: "provisioning", provision_error: null })
      .eq("id", client.id);

    // ---- 1) License validation ----
    // Distributors / Master: unlimited. Software Retailers: consume prepaid product units.
    const { data: reserveRows, error: reserveErr } = await admin.rpc(
      "reserve_deploy_license",
      {
        p_distributor_id: distributor.id,
        p_client_id: client.id,
        p_product_id: client.product_id,
        p_actor: user.id,
      },
    );

    if (reserveErr) {
      await failJob(admin, job.id, client.id, "wallet_validation", reserveErr.message, steps);
      return jsonResponse({ error: reserveErr.message }, 402);
    }

    const reserve = Array.isArray(reserveRows) ? reserveRows[0] : reserveRows;
    await pushStep(job.id, "wallet_validation", "ok", reserve);
    await pushStep(job.id, "license_debit", "ok", reserve);

    // ---- 2) Domain / portal hostname ----
    // Tenants always use slug.webfinance.app (MM and PM share the pattern)
    let portalHostname = (client.portal_hostname as string | null) ?? null;
    const desiredPortal = `${String(client.slug).toLowerCase().replace(/[^a-z0-9-]+/g, "-")}.webfinance.app`;
    if (!portalHostname || portalHostname.endsWith(".mm.webfinance.app") || portalHostname.endsWith(".pm.webfinance.app")) {
      portalHostname = desiredPortal;
      await admin
        .from("clients")
        .update({
          portal_hostname: portalHostname,
          custom_domain:
            !client.custom_domain ||
            String(client.custom_domain).endsWith(".webfinance.app")
              ? portalHostname
              : client.custom_domain,
        })
        .eq("id", client.id);
    }

    let domain = (client.custom_domain as string | null) || portalHostname;
    const isManagedPortal =
      domain.endsWith(".webfinance.app") ||
      Boolean(
        (client.products as { client_portal_base_domain?: string | null } | null)
          ?.client_portal_base_domain &&
          domain.endsWith(
            String(
              (client.products as { client_portal_base_domain?: string | null })
                .client_portal_base_domain,
            ).replace(/^https?:\/\//, ""),
          ),
      );

    // Domain purchase is self-serve: distributors/clients buy at a registrar.
    // Deploy never charges Namecheap/ResellerClub for custom domains.
    await pushStep(job.id, "domain_registration", "skipped", {
      reason: isManagedPortal
        ? "managed product portal (wildcard DNS)"
        : "self_serve_domains_only (connect/buy on Domains or Clients)",
    });

    // ---- 3) Cloudflare DNS + SSL ----
    // Managed *.webfinance.app portals use platform wildcard — never call CF per-tenant
    // (CF SSL was hanging Deploy and leaving clients stuck in "provisioning").
    const allowMock = Deno.env.get("ALLOW_MOCK_INTEGRATIONS") === "true";
    const hasCf = Boolean(Deno.env.get("CLOUDFLARE_API_TOKEN"));

    if (domain && isManagedPortal) {
      await pushStep(job.id, "dns_setup", "skipped", {
        reason: "covered by managed portal DNS helper",
      });
      try {
        const productSku = String(
          (client.products as { sku?: string } | null)?.sku ?? "",
        );
        const nd = await ensureManagedTenantDns(portalHostname!, productSku);
        await pushStep(job.id, "netlify_dns", nd.skipped ? "skipped" : "ok", nd);
      } catch (dnsErr) {
        await pushStep(job.id, "netlify_dns", "skipped", {
          error: dnsErr instanceof Error ? dnsErr.message : String(dnsErr),
        });
      }
      await pushStep(job.id, "ssl_init", "skipped", {
        reason: "Netlify / platform SSL for managed host",
      });
      await admin
        .from("clients")
        .update({ domain_status: "live", ssl_status: "platform_managed" })
        .eq("id", client.id);
    } else if (domain && hasCf) {
      await admin.from("clients").update({ domain_status: "dns_pending" }).eq("id", client.id);
      const dns = await upsertTenantDns(domain);
      await pushStep(job.id, "dns_setup", "ok", dns);
      await admin
        .from("clients")
        .update({
          domain_status: "ssl_pending",
          cloudflare_zone_id: dns.zoneId,
          cloudflare_record_ids: dns.recordIds,
        })
        .eq("id", client.id);

      const ssl = await initiateSsl(domain, dns.zoneId);
      await pushStep(job.id, "ssl_init", "ok", ssl);
      await admin
        .from("clients")
        .update({ domain_status: "live", ssl_status: String(ssl.mode) })
        .eq("id", client.id);
    } else if (domain && allowMock) {
      const dns = await upsertTenantDnsMock(domain);
      await pushStep(job.id, "dns_setup", "ok", dns);
      const ssl = await initiateSslMock(domain);
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

    const meta = (client.metadata ?? {}) as Record<string, unknown>;
    const brandingMeta = (meta.branding as Record<string, unknown> | undefined) ?? {};
    const adminEmailFromMeta =
      typeof meta.admin_email === "string" ? meta.admin_email.trim() : "";
    const adminFullName =
      (typeof meta.admin_full_name === "string" && meta.admin_full_name.trim()) ||
      (typeof brandingMeta.brand_name === "string" && brandingMeta.brand_name.trim()) ||
      String(client.display_name || client.slug || "Tenant Admin");
    const adminEmail =
      adminEmailFromMeta ||
      (domain ? `admin@${domain}` : `admin@${client.slug}.webfinance.app`);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error(`Invalid admin_email for handshake: ${adminEmail}`);
    }

    const portalUrl = `https://${portalHostname}`;
    const brandName =
      (typeof brandingMeta.brand_name === "string" && brandingMeta.brand_name.trim()) ||
      String(client.display_name);

    const tenant = await provisionTenant(product, {
      clientId: client.id,
      distributorId: distributor.id,
      productSku: product.sku,
      displayName: client.display_name,
      slug: client.slug,
      customDomain: portalHostname || domain,
      adminEmail,
      adminFullName,
      branding: {
        brandName,
        logoUrl:
          typeof brandingMeta.logo_url === "string" ? brandingMeta.logo_url : null,
        primaryColor:
          typeof brandingMeta.primary_color === "string"
            ? brandingMeta.primary_color
            : "#14594c",
        accentColor:
          typeof brandingMeta.accent_color === "string"
            ? brandingMeta.accent_color
            : null,
        dashboardTemplate:
          typeof brandingMeta.dashboard_template === "string"
            ? brandingMeta.dashboard_template
            : null,
        dashboardStyle:
          typeof brandingMeta.dashboard_style === "string"
            ? brandingMeta.dashboard_style
            : null,
        featureFlags:
          brandingMeta.feature_flags &&
          typeof brandingMeta.feature_flags === "object"
            ? (brandingMeta.feature_flags as Record<string, boolean>)
            : null,
      },
    });

    await pushStep(job.id, "tenant_handshake", "ok", {
      externalTenantId: tenant.externalTenantId,
      accessUrl: tenant.accessUrl,
      adminEmail: tenant.adminEmail,
    });

    // ---- 5) Finalize deliverables ----
    const clientLoginUrl =
      tenant.accessUrl ||
      `https://${client.slug}.apps.webfinance.app/login`;
    const credentialsPayload = {
      admin_email: tenant.adminEmail,
      temporary_password: tenant.temporaryPassword ?? null,
      access_url: clientLoginUrl,
      client_login_url: clientLoginUrl,
      admin_dashboard_url: clientLoginUrl.replace(/\/login\/?$/, "/admin"),
      portal_url: portalUrl,
      website: portalUrl,
      brand_name: brandName,
      logo_url:
        typeof brandingMeta.logo_url === "string" ? brandingMeta.logo_url : null,
      primary_color:
        typeof brandingMeta.primary_color === "string"
          ? brandingMeta.primary_color
          : "#14594c",
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

    const debitInfo = (Array.isArray(reserve) ? reserve[0] : reserve) as
      | { inventory_remaining?: number | null }
      | null;
    try {
      const { data: owner } = await admin
        .from("distributors")
        .select("profile_id, partner_tier, deploy_units, company_name")
        .eq("id", distributor.id)
        .maybeSingle();
      if (owner?.profile_id) {
        const remaining =
          debitInfo?.inventory_remaining ?? owner.deploy_units ?? null;
        const stockNote =
          owner.partner_tier === "software_retailer" && remaining !== null
            ? ` ${remaining} deploy unit${remaining === 1 ? "" : "s"} left.`
            : "";
        await notifyProfiles(admin, [owner.profile_id], {
          title: "Client deployed",
          body: `${client.display_name} is live.${stockNote}`,
          kind: "client_deployed",
          href: "/clients",
          metadata: { client_id: client.id, remaining },
        });
      }
    } catch (notifyErr) {
      console.error("deploy notify failed", notifyErr);
    }

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
    if (activeJobId && activeClientId) {
      try {
        await failJob(admin, activeJobId, activeClientId, "failed", message, steps);
      } catch (failErr) {
        console.error("failJob error", failErr);
      }
    } else if (activeClientId) {
      await admin
        .from("clients")
        .update({ status: "failed", provision_error: message })
        .eq("id", activeClientId);
    }
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
