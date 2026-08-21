/**
 * Attach external partner/client domains via Netlify domain aliases when
 * Cloudflare for SaaS is not configured. Customers CNAME to ORIGIN_HOSTNAME
 * (default edge.webfinance.app → Control Plane Netlify site).
 */

import type { DnsInstruction } from "./cloudflare.ts";

const CP_SITE_ID =
  Deno.env.get("CP_NETLIFY_SITE_ID") ?? "24202d75-e5e1-4e4a-a5ea-bf5a3adc88c1";
const CP_NETLIFY_HOST =
  Deno.env.get("CP_NETLIFY_HOST") ?? "webfinance-distributor-cp.netlify.app";

function cnameTarget(): string {
  return (
    Deno.env.get("ORIGIN_HOSTNAME") ??
    Deno.env.get("SAAS_FALLBACK_ORIGIN") ??
    "edge.webfinance.app"
  ).replace(/\.$/, "");
}

function netlifyToken(): string | null {
  return Deno.env.get("NETLIFY_AUTH_TOKEN") ?? Deno.env.get("NETLIFY_TOKEN") ?? null;
}

function siteIdForScope(scope: "client" | "distributor", productSku?: string | null): string {
  if (scope === "distributor") return CP_SITE_ID;
  const sku = (productSku ?? "").toUpperCase();
  if (sku.includes("PRODUCT_B") || sku === "PM") {
    return Deno.env.get("PRODUCT_B_NETLIFY_SITE_ID") ?? "7958037c-d19e-42ba-97f6-a308f78fa27d";
  }
  return Deno.env.get("PRODUCT_A_NETLIFY_SITE_ID") ?? "c9400b72-b2fb-4803-9bb9-6c0ee521440c";
}

function dnsTargetForScope(scope: "client" | "distributor", productSku?: string | null): string {
  if (scope === "distributor") return cnameTarget();
  const sku = (productSku ?? "").toUpperCase();
  if (sku.includes("PRODUCT_B") || sku === "PM") {
    return Deno.env.get("PRODUCT_B_NETLIFY_HOST") ?? "safeogistics.netlify.app";
  }
  return Deno.env.get("PRODUCT_A_NETLIFY_HOST") ?? "aesthetic-stardust-5199e7.netlify.app";
}

export function buildNetlifyDomainInstructions(
  hostname: string,
  target: string,
): DnsInstruction[] {
  const apex = hostname;
  const www = hostname.startsWith("www.") ? hostname : `www.${hostname}`;
  const instructions: DnsInstruction[] = [
    {
      type: "CNAME",
      name: www,
      value: target,
      purpose: "Recommended — point www at Webfinance (works at most registrars)",
    },
  ];
  // Apex CNAME often fails; still show ALIAS guidance
  instructions.push({
    type: "ALIAS or ANAME (or CNAME if allowed)",
    name: apex,
    value: target,
    purpose:
      "Optional apex — if your DNS host blocks apex CNAME, use www only or ALIAS/ANAME",
  });
  return instructions;
}

async function ensureSiteAliases(siteId: string, hosts: string[]): Promise<unknown> {
  const token = netlifyToken();
  if (!token) throw new Error("NETLIFY_AUTH_TOKEN not set");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const siteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers });
  const site = await siteRes.json();
  if (!siteRes.ok) {
    throw new Error(`Netlify site fetch failed: ${JSON.stringify(site)}`);
  }
  const aliases: string[] = Array.isArray(site.domain_aliases) ? [...site.domain_aliases] : [];
  let changed = false;
  for (const h of hosts) {
    if (!aliases.includes(h)) {
      aliases.push(h);
      changed = true;
    }
  }
  if (!changed) return { skipped: true, aliases };
  const upd = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ domain_aliases: aliases }),
  });
  const body = await upd.json().catch(() => ({ status: upd.status }));
  if (!upd.ok) throw new Error(`Netlify alias update failed: ${JSON.stringify(body)}`);
  return body;
}

async function resolveHost(name: string): Promise<{ ok: boolean; cname?: string; addrs?: string[] }> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=CNAME`,
    );
    const j = await res.json();
    const answers = Array.isArray(j.Answer) ? j.Answer : [];
    const cname = answers.find((a: { type?: number }) => a.type === 5)?.data as string | undefined;
    if (cname) return { ok: true, cname: cname.replace(/\.$/, "").toLowerCase() };

    const aRes = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=A`,
    );
    const aJ = await aRes.json();
    const aAnswers = Array.isArray(aJ.Answer) ? aJ.Answer : [];
    const addrs = aAnswers
      .filter((a: { type?: number }) => a.type === 1)
      .map((a: { data?: string }) => String(a.data ?? ""));
    return { ok: addrs.length > 0, addrs };
  } catch {
    return { ok: false };
  }
}

function targetMatches(resolvedCname: string | undefined, expected: string): boolean {
  if (!resolvedCname) return false;
  const exp = expected.replace(/\.$/, "").toLowerCase();
  const got = resolvedCname.replace(/\.$/, "").toLowerCase();
  if (got === exp) return true;
  // Accept either edge.webfinance.app or the underlying Netlify host
  if (exp === "edge.webfinance.app" && got === CP_NETLIFY_HOST) return true;
  if (got === "edge.webfinance.app" && (exp === CP_NETLIFY_HOST || exp.includes("netlify.app"))) {
    return true;
  }
  return got.endsWith(exp) || exp.endsWith(got);
}

export type NetlifyCustomDomainResult = {
  mode: "netlify_alias";
  live: boolean;
  zoneId: string;
  recordIds: string[];
  instructions: DnsInstruction[];
  sslStatus: string;
  detail: unknown;
};

export async function provisionNetlifyCustomDomain(opts: {
  hostname: string;
  scope: "client" | "distributor";
  productSku?: string | null;
}): Promise<NetlifyCustomDomainResult> {
  const siteId = siteIdForScope(opts.scope, opts.productSku);
  const target = dnsTargetForScope(opts.scope, opts.productSku);
  const www = opts.hostname.startsWith("www.") ? opts.hostname : `www.${opts.hostname}`;
  const hosts = Array.from(new Set([opts.hostname, www]));

  const aliasDetail = await ensureSiteAliases(siteId, hosts);
  const instructions = buildNetlifyDomainInstructions(opts.hostname, target);

  // Check if DNS already points correctly
  const checks = await Promise.all(hosts.map((h) => resolveHost(h)));
  const dnsOk = checks.some(
    (c) => c.ok && (targetMatches(c.cname, target) || (c.addrs?.length ?? 0) > 0),
  );

  let httpsOk = false;
  if (dnsOk) {
    for (const host of hosts) {
      try {
        const res = await fetch(`https://${host}/`, {
          method: "HEAD",
          redirect: "manual",
        });
        if (res.status > 0 && res.status < 500) {
          httpsOk = true;
          break;
        }
      } catch {
        /* SSL may still be provisioning */
      }
    }
  }

  const live = dnsOk && httpsOk;
  return {
    mode: "netlify_alias",
    live,
    zoneId: `netlify-${siteId}`,
    recordIds: hosts,
    instructions,
    sslStatus: live ? "active" : dnsOk ? "provisioning" : "pending_validation",
    detail: { siteId, target, aliasDetail, dnsOk, httpsOk, hosts },
  };
}

export async function verifyNetlifyCustomDomain(opts: {
  hostname: string;
  scope: "client" | "distributor";
  productSku?: string | null;
}): Promise<NetlifyCustomDomainResult> {
  // Re-run provision (idempotent alias ensure + DNS/HTTPS checks)
  return provisionNetlifyCustomDomain(opts);
}
