/**
 * Cloudflare DNS + SSL automation helpers.
 *
 * Flow:
 * 1) Ensure zone exists (or create) for the apex domain
 * 2) Point nameservers at Cloudflare (registrar step may also do this)
 * 3) Upsert A / CNAME records for app hostname
 * 4) Enable Universal SSL / custom hostname SSL (ACME via Cloudflare)
 */

export type DnsRecordResult = {
  zoneId: string;
  recordIds: string[];
  hostname: string;
};

function cfHeaders(): HeadersInit {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) throw new Error("Missing CLOUDFLARE_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

const CF_API = "https://api.cloudflare.com/client/v4";

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: { ...cfHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    throw new Error(`Cloudflare API error ${path}: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.result as T;
}

export async function ensureZone(domain: string): Promise<{ id: string; name: string }> {
  const apex = domain.split(".").slice(-2).join(".");
  const existing = await cfFetch<Array<{ id: string; name: string }>>(
    `/zones?name=${encodeURIComponent(apex)}`,
  );
  if (existing?.[0]) return existing[0];

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  if (!accountId) {
    throw new Error("Zone not found and CLOUDFLARE_ACCOUNT_ID missing for create");
  }

  return await cfFetch<{ id: string; name: string }>("/zones", {
    method: "POST",
    body: JSON.stringify({
      name: apex,
      account: { id: accountId },
      jump_start: true,
      type: "full",
    }),
  });
}

/**
 * Create/update DNS A (or CNAME) records for the tenant hostname.
 * Target comes from PRODUCT_*_ORIGIN_IP or ORIGIN_HOSTNAME.
 */
export async function upsertTenantDns(
  hostname: string,
  opts?: { useCname?: boolean },
): Promise<DnsRecordResult> {
  const zone = await ensureZone(hostname);
  const useCname = opts?.useCname ?? Boolean(Deno.env.get("ORIGIN_HOSTNAME"));
  const recordIds: string[] = [];

  if (useCname) {
    const target = Deno.env.get("ORIGIN_HOSTNAME");
    if (!target) throw new Error("ORIGIN_HOSTNAME required for CNAME mode");
    const record = await upsertRecord(zone.id, {
      type: "CNAME",
      name: hostname,
      content: target,
      ttl: 1,
      proxied: true,
    });
    recordIds.push(record.id);
  } else {
    const ip = Deno.env.get("ORIGIN_IP");
    if (!ip) throw new Error("ORIGIN_IP required for A record mode");
    const record = await upsertRecord(zone.id, {
      type: "A",
      name: hostname,
      content: ip,
      ttl: 1,
      proxied: true,
    });
    recordIds.push(record.id);
  }

  // Optional www → apex CNAME
  if (Deno.env.get("CREATE_WWW_CNAME") === "true") {
    const www = await upsertRecord(zone.id, {
      type: "CNAME",
      name: `www.${hostname}`,
      content: hostname,
      ttl: 1,
      proxied: true,
    });
    recordIds.push(www.id);
  }

  return { zoneId: zone.id, recordIds, hostname };
}

async function upsertRecord(
  zoneId: string,
  body: {
    type: string;
    name: string;
    content: string;
    ttl: number;
    proxied: boolean;
  },
): Promise<{ id: string }> {
  const existing = await cfFetch<Array<{ id: string }>>(
    `/zones/${zoneId}/dns_records?type=${body.type}&name=${encodeURIComponent(body.name)}`,
  );
  if (existing?.[0]) {
    return await cfFetch<{ id: string }>(`/zones/${zoneId}/dns_records/${existing[0].id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
  return await cfFetch<{ id: string }>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Initiate SSL via Cloudflare Universal SSL / ACME.
 * For SaaS multi-tenant on a shared zone, prefer Custom Hostnames (SSL for SaaS).
 */
export async function initiateSsl(hostname: string, zoneId: string): Promise<{ mode: string; detail: unknown }> {
  const mode = Deno.env.get("SSL_MODE") ?? "universal";

  if (mode === "custom_hostname") {
    // Cloudflare for SaaS — ACME HTTP/TXT validation handled by CF
    const fallbackOrigin = Deno.env.get("SAAS_FALLBACK_ORIGIN");
    const result = await cfFetch(`/zones/${zoneId}/custom_hostnames`, {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "http",
          type: "dv",
          settings: { min_tls_version: "1.2" },
        },
        ...(fallbackOrigin ? { custom_origin_server: fallbackOrigin } : {}),
      }),
    });
    return { mode, detail: result };
  }

  // Universal SSL: ensure SSL is flexible/full and patch zone SSL settings
  await cfFetch(`/zones/${zoneId}/settings/ssl`, {
    method: "patch",
    body: JSON.stringify({ value: Deno.env.get("CF_SSL_VALUE") ?? "full" }),
  });
  await cfFetch(`/zones/${zoneId}/settings/always_use_https`, {
    method: "patch",
    body: JSON.stringify({ value: "on" }),
  });

  return {
    mode: "universal",
    detail: { message: "Universal SSL + Always HTTPS enabled; cert issuance is async via ACME" },
  };
}

export type DnsInstruction = {
  type: string;
  name: string;
  value: string;
  purpose?: string;
};

export type SaasHostnameResult = {
  id: string;
  hostname: string;
  status: string;
  sslStatus: string | null;
  zoneId: string;
  live: boolean;
  instructions: DnsInstruction[];
  detail: unknown;
};

function platformZoneName(): string {
  return (Deno.env.get("SAAS_ZONE_NAME") ?? "webfinance.app").replace(/^https?:\/\//, "");
}

function cnameTarget(): string {
  return (
    Deno.env.get("ORIGIN_HOSTNAME") ??
    Deno.env.get("SAAS_FALLBACK_ORIGIN") ??
    "edge.webfinance.app"
  ).replace(/\.$/, "");
}

async function resolveSaasZoneId(): Promise<string> {
  const fromEnv = Deno.env.get("SAAS_ZONE_ID");
  if (fromEnv) return fromEnv;
  const zone = await ensureZone(platformZoneName());
  return zone.id;
}

function extractInstructions(hostname: string, detail: Record<string, unknown>): DnsInstruction[] {
  const instructions: DnsInstruction[] = [
    {
      type: "CNAME",
      name: hostname,
      value: cnameTarget(),
      purpose: "Point your domain at Webfinance (required)",
    },
  ];

  const ownership = detail.ownership_verification as
    | { type?: string; name?: string; value?: string }
    | undefined;
  if (ownership?.name && ownership?.value) {
    instructions.push({
      type: (ownership.type ?? "txt").toUpperCase(),
      name: ownership.name,
      value: ownership.value,
      purpose: "Cloudflare ownership check",
    });
  }

  const ssl = detail.ssl as
    | {
        status?: string;
        validation_records?: Array<{ txt_name?: string; txt_value?: string; http_url?: string }>;
      }
    | undefined;
  for (const rec of ssl?.validation_records ?? []) {
    if (rec.txt_name && rec.txt_value) {
      instructions.push({
        type: "TXT",
        name: rec.txt_name,
        value: rec.txt_value,
        purpose: "SSL certificate validation",
      });
    }
  }

  return instructions;
}

/** Attach external domain via Cloudflare for SaaS (Custom Hostnames). */
export async function attachSaasHostname(hostname: string): Promise<SaasHostnameResult> {
  const zoneId = await resolveSaasZoneId();
  const existing = await cfFetch<Array<Record<string, unknown>>>(
    `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
  );

  let detail: Record<string, unknown>;
  if (existing?.[0]) {
    detail = existing[0];
  } else {
    const fallbackOrigin = Deno.env.get("SAAS_FALLBACK_ORIGIN") ?? Deno.env.get("ORIGIN_HOSTNAME");
    detail = (await cfFetch(`/zones/${zoneId}/custom_hostnames`, {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: {
          method: "txt",
          type: "dv",
          settings: { min_tls_version: "1.2", http2: "on" },
        },
        ...(fallbackOrigin ? { custom_origin_server: fallbackOrigin } : {}),
      }),
    })) as Record<string, unknown>;
  }

  const status = String(detail.status ?? "pending");
  const sslStatus = (detail.ssl as { status?: string } | undefined)?.status ?? null;
  const live = status === "active" && sslStatus === "active";

  return {
    id: String(detail.id ?? ""),
    hostname,
    status,
    sslStatus,
    zoneId,
    live,
    instructions: extractInstructions(hostname, detail),
    detail,
  };
}

export async function getSaasHostnameStatus(hostname: string): Promise<SaasHostnameResult> {
  const zoneId = await resolveSaasZoneId();
  const existing = await cfFetch<Array<Record<string, unknown>>>(
    `/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
  );
  if (!existing?.[0]) {
    return {
      id: "",
      hostname,
      status: "missing",
      sslStatus: null,
      zoneId,
      live: false,
      instructions: extractInstructions(hostname, {}),
      detail: { message: "Custom hostname not found" },
    };
  }
  const detail = existing[0];
  const status = String(detail.status ?? "pending");
  const sslStatus = (detail.ssl as { status?: string } | undefined)?.status ?? null;
  const live = status === "active" && sslStatus === "active";
  return {
    id: String(detail.id ?? ""),
    hostname,
    status,
    sslStatus,
    zoneId,
    live,
    instructions: extractInstructions(hostname, detail),
    detail,
  };
}

/** Prefer SaaS custom hostnames for external domains; fall back to zone DNS when configured. */
export async function provisionExternalDomain(hostname: string): Promise<{
  mode: string;
  live: boolean;
  zoneId: string;
  recordIds: string[];
  instructions: DnsInstruction[];
  sslStatus: string | null;
  detail: unknown;
}> {
  const preferSaas =
    (Deno.env.get("SSL_MODE") ?? "custom_hostname") === "custom_hostname" ||
    Boolean(Deno.env.get("SAAS_ZONE_ID") || Deno.env.get("SAAS_ZONE_NAME"));

  if (preferSaas) {
    try {
      const saas = await attachSaasHostname(hostname);
      return {
        mode: "custom_hostname",
        live: saas.live,
        zoneId: saas.zoneId,
        recordIds: saas.id ? [saas.id] : [],
        instructions: saas.instructions,
        sslStatus: saas.sslStatus,
        detail: saas.detail,
      };
    } catch (err) {
      // Fall through to zone DNS if SaaS zone isn't ready
      if (!Deno.env.get("ORIGIN_HOSTNAME") && !Deno.env.get("ORIGIN_IP")) throw err;
    }
  }

  const dns = await upsertTenantDns(hostname);
  const ssl = await initiateSsl(hostname, dns.zoneId);
  return {
    mode: String(ssl.mode),
    live: false,
    zoneId: dns.zoneId,
    recordIds: dns.recordIds,
    instructions: [
      {
        type: "CNAME",
        name: hostname,
        value: cnameTarget(),
        purpose: "Point your domain at Webfinance",
      },
    ],
    sslStatus: String(ssl.mode),
    detail: { dns, ssl },
  };
}

export async function verifyExternalDomain(hostname: string): Promise<{
  live: boolean;
  status: string;
  sslStatus: string | null;
  instructions: DnsInstruction[];
  detail: unknown;
}> {
  try {
    const saas = await getSaasHostnameStatus(hostname);
    return {
      live: saas.live,
      status: saas.status,
      sslStatus: saas.sslStatus,
      instructions: saas.instructions,
      detail: saas.detail,
    };
  } catch {
    // Zone-owned domains: treat as live once DNS exists (ACME is async)
    return {
      live: false,
      status: "dns_pending",
      sslStatus: null,
      instructions: [
        {
          type: "CNAME",
          name: hostname,
          value: cnameTarget(),
          purpose: "Point your domain at Webfinance",
        },
      ],
      detail: { message: "Awaiting DNS propagation" },
    };
  }
}

/** Local/dev stub when CLOUDFLARE_API_TOKEN is unset and ALLOW_MOCK_INTEGRATIONS=true */
export async function upsertTenantDnsMock(hostname: string): Promise<DnsRecordResult> {
  return {
    zoneId: `mock-zone-${hostname}`,
    recordIds: [`mock-rec-${crypto.randomUUID()}`],
    hostname,
  };
}

export async function initiateSslMock(hostname: string): Promise<{ mode: string; detail: unknown }> {
  return { mode: "mock", detail: { hostname, status: "pending_validation" } };
}

export function mockExternalDomain(hostname: string) {
  const target = cnameTarget();
  const www = hostname.startsWith("www.") ? hostname : `www.${hostname}`;
  return {
    mode: "mock",
    live: false,
    zoneId: `mock-zone-${hostname}`,
    recordIds: [`mock-ch-${crypto.randomUUID()}`],
    instructions: [
      {
        type: "CNAME",
        name: www,
        value: target,
        purpose: "Recommended — point www at Webfinance",
      },
      {
        type: "ALIAS / ANAME (or CNAME if allowed)",
        name: hostname,
        value: target,
        purpose: "Optional apex — use if your DNS host supports ALIAS/ANAME",
      },
    ] as DnsInstruction[],
    sslStatus: "pending_validation",
    detail: { hostname, mock: true },
  };
}