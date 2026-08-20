/**
 * Attach / verify / detach custom domains for distributors & clients.
 * Automates Cloudflare for SaaS (custom hostname) + SSL; user only adds the CNAME.
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  mockExternalDomain,
  provisionExternalDomain,
  verifyExternalDomain,
  type DnsInstruction,
} from "../_shared/cloudflare.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

type Scope = "client" | "distributor";
type Action = "attach" | "verify" | "detach";

type Body = {
  scope: Scope;
  entity_id: string;
  domain?: string;
  action?: Action;
};

function cleanDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.scope || !body.entity_id) {
    return jsonResponse({ error: "scope and entity_id are required" }, 400);
  }

  const action: Action = body.action ?? "attach";
  const userClient = createUserClient(authHeader);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "platform_admin";

  const { data: callerDist } = await admin
    .from("distributors")
    .select("id, is_master")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (body.scope === "distributor") {
    const { data: dist, error } = await admin
      .from("distributors")
      .select("*")
      .eq("id", body.entity_id)
      .maybeSingle();
    if (error || !dist) return jsonResponse({ error: "Distributor not found" }, 404);
    if (!isAdmin && dist.profile_id !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }
    if (dist.is_master) {
      return jsonResponse({ error: "Master uses webfinance.app — custom domains are for partners" }, 400);
    }

    if (action === "detach") {
      await admin
        .from("distributors")
        .update({
          custom_domain: null,
          domain_status: "none",
          ssl_status: null,
          cloudflare_zone_id: null,
          cloudflare_record_ids: [],
          metadata: {
            ...(dist.metadata ?? {}),
            domain_automation: null,
          },
        })
        .eq("id", dist.id);
      return jsonResponse({ ok: true, domain_status: "none", live: false });
    }

    const domain =
      cleanDomain(body.domain ?? dist.custom_domain ?? "") ||
      null;
    if (!domain || !domain.includes(".")) {
      return jsonResponse({ error: "Enter a valid domain like example.com" }, 400);
    }

    if (action === "verify") {
      return await verifyAndPersist("distributor", dist.id, domain, dist.metadata ?? {});
    }

    return await attachAndPersist("distributor", dist.id, domain, dist.metadata ?? {});
  }

  // client scope
  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select("*")
    .eq("id", body.entity_id)
    .maybeSingle();
  if (clientErr || !client) return jsonResponse({ error: "Client not found" }, 404);
  if (!isAdmin && callerDist?.id !== client.distributor_id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (action === "detach") {
    const free = client.portal_hostname as string | null;
    await admin
      .from("clients")
      .update({
        custom_domain: free || null,
        domain_status: free ? "live" : "none",
        ssl_status: free ? "platform_wildcard" : null,
        metadata: {
          ...(client.metadata ?? {}),
          domain_automation: null,
          domain_owner: null,
        },
      })
      .eq("id", client.id);
    return jsonResponse({ ok: true, domain_status: free ? "live" : "none", live: Boolean(free) });
  }

  const domain = cleanDomain(body.domain ?? client.custom_domain ?? "");
  if (!domain || !domain.includes(".")) {
    return jsonResponse({ error: "Enter a valid domain like example.com" }, 400);
  }

  // Don't run SaaS attach for managed product portals
  if (domain.endsWith(".webfinance.app")) {
    await admin
      .from("clients")
      .update({
        custom_domain: domain,
        domain_status: "live",
        ssl_status: "platform_wildcard",
      })
      .eq("id", client.id);
    return jsonResponse({
      ok: true,
      domain,
      domain_status: "live",
      live: true,
      instructions: [] as DnsInstruction[],
      message: "Managed portal hostname — covered by platform wildcard",
    });
  }

  if (action === "verify") {
    return await verifyAndPersist("client", client.id, domain, client.metadata ?? {});
  }

  return await attachAndPersist("client", client.id, domain, client.metadata ?? {});
});

async function attachAndPersist(
  scope: Scope,
  entityId: string,
  domain: string,
  existingMeta: Record<string, unknown>,
) {
  const admin = createServiceClient();
  const table = scope === "client" ? "clients" : "distributors";
  const hasCf = Boolean(Deno.env.get("CLOUDFLARE_API_TOKEN"));
  const allowMock = Deno.env.get("ALLOW_MOCK_INTEGRATIONS") === "true";

  await admin
    .from(table)
    .update({
      custom_domain: domain,
      domain_status: "dns_pending",
      ...(scope === "client"
        ? {
            metadata: {
              ...existingMeta,
              domain_owner: "self_serve",
              domain_connected_at: new Date().toISOString(),
            },
          }
        : {}),
    })
    .eq("id", entityId);

  let result:
    | ReturnType<typeof mockExternalDomain>
    | Awaited<ReturnType<typeof provisionExternalDomain>>;

  try {
    if (hasCf) {
      result = await provisionExternalDomain(domain);
    } else if (allowMock) {
      result = mockExternalDomain(domain);
    } else {
      result = mockExternalDomain(domain);
      result.detail = {
        warning: "CLOUDFLARE_API_TOKEN not set — DNS instructions only until CF is configured",
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from(table)
      .update({
        domain_status: "failed",
        metadata: {
          ...existingMeta,
          domain_automation: { error: message, at: new Date().toISOString() },
        },
      })
      .eq("id", entityId);
    return jsonResponse({ error: message, domain_status: "failed" }, 502);
  }

  const domainStatus = result.live ? "live" : "dns_pending";
  const patch: Record<string, unknown> = {
    custom_domain: domain,
    domain_status: domainStatus,
    cloudflare_zone_id: result.zoneId,
    cloudflare_record_ids: result.recordIds,
    ssl_status: result.sslStatus ?? result.mode,
    metadata: {
      ...existingMeta,
      domain_owner: "self_serve",
      domain_connected_at: new Date().toISOString(),
      domain_automation: {
        mode: result.mode,
        instructions: result.instructions,
        detail: result.detail,
        updated_at: new Date().toISOString(),
      },
    },
  };

  await admin.from(table).update(patch).eq("id", entityId);

  return jsonResponse({
    ok: true,
    domain,
    domain_status: domainStatus,
    live: result.live,
    mode: result.mode,
    ssl_status: result.sslStatus,
    instructions: result.instructions,
    message: result.live
      ? "Domain is live"
      : "Domain registered. Add the CNAME below — we auto-finish SSL once DNS propagates.",
  });
}

async function verifyAndPersist(
  scope: Scope,
  entityId: string,
  domain: string,
  existingMeta: Record<string, unknown>,
) {
  const admin = createServiceClient();
  const table = scope === "client" ? "clients" : "distributors";
  const hasCf = Boolean(Deno.env.get("CLOUDFLARE_API_TOKEN"));
  const allowMock = Deno.env.get("ALLOW_MOCK_INTEGRATIONS") === "true";

  if (!hasCf) {
    // Without CF, auto-promote after attach in mock so UX can be demoed
    if (allowMock) {
      await admin
        .from(table)
        .update({
          domain_status: "live",
          ssl_status: "mock",
          metadata: {
            ...existingMeta,
            domain_automation: {
              ...(typeof existingMeta.domain_automation === "object" &&
              existingMeta.domain_automation
                ? (existingMeta.domain_automation as object)
                : {}),
              verified_at: new Date().toISOString(),
              mock_live: true,
            },
          },
        })
        .eq("id", entityId);
      return jsonResponse({
        ok: true,
        domain,
        domain_status: "live",
        live: true,
        instructions: mockExternalDomain(domain).instructions,
        message: "Mock mode: marked live",
      });
    }
    return jsonResponse({
      ok: true,
      domain,
      domain_status: "dns_pending",
      live: false,
      instructions: mockExternalDomain(domain).instructions,
      message: "Waiting for Cloudflare configuration",
    });
  }

  try {
    const verified = await verifyExternalDomain(domain);
    const domainStatus = verified.live ? "live" : "dns_pending";
    await admin
      .from(table)
      .update({
        domain_status: domainStatus,
        ssl_status: verified.sslStatus ?? (verified.live ? "active" : "pending_validation"),
        metadata: {
          ...existingMeta,
          domain_automation: {
            ...(typeof existingMeta.domain_automation === "object" &&
            existingMeta.domain_automation
              ? (existingMeta.domain_automation as object)
              : {}),
            instructions: verified.instructions,
            detail: verified.detail,
            verified_at: new Date().toISOString(),
            cf_status: verified.status,
          },
        },
      })
      .eq("id", entityId);

    return jsonResponse({
      ok: true,
      domain,
      domain_status: domainStatus,
      live: verified.live,
      ssl_status: verified.sslStatus,
      cf_status: verified.status,
      instructions: verified.instructions,
      message: verified.live
        ? "Domain is live with SSL"
        : "Still waiting for DNS/SSL — keep the CNAME; we will finish automatically.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message, domain_status: "failed" }, 502);
  }
}
