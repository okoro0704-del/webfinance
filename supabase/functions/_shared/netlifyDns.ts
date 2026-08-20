/**
 * Provision {slug}.webfinance.app DNS + Netlify domain alias for product apps.
 */

export type NetlifyDnsResult = {
  skipped?: boolean;
  hostname: string;
  target?: string;
  dns?: unknown;
  alias?: unknown;
  reason?: string;
};

function productTarget(sku: string): { host: string; siteId: string | null } {
  const isPm = sku.toUpperCase().includes("PRODUCT_B") || sku.toUpperCase() === "PM";
  if (isPm) {
    return {
      host: Deno.env.get("PRODUCT_B_NETLIFY_HOST") ?? "safeogistics.netlify.app",
      siteId: Deno.env.get("PRODUCT_B_NETLIFY_SITE_ID") ?? "7958037c-d19e-42ba-97f6-a308f78fa27d",
    };
  }
  return {
    host: Deno.env.get("PRODUCT_A_NETLIFY_HOST") ?? "aesthetic-stardust-5199e7.netlify.app",
    siteId: Deno.env.get("PRODUCT_A_NETLIFY_SITE_ID") ?? "c9400b72-b2fb-4803-9bb9-6c0ee521440c",
  };
}

export async function ensureManagedTenantDns(
  portalHostname: string,
  productSku: string,
): Promise<NetlifyDnsResult> {
  const token = Deno.env.get("NETLIFY_AUTH_TOKEN") ?? Deno.env.get("NETLIFY_TOKEN");
  const zoneId = Deno.env.get("NETLIFY_DNS_ZONE_ID") ?? "6a6fb4bdf207a902ca2184d3";
  if (!token) {
    return { skipped: true, hostname: portalHostname, reason: "NETLIFY_AUTH_TOKEN not set" };
  }
  if (!portalHostname.endsWith(".webfinance.app")) {
    return { skipped: true, hostname: portalHostname, reason: "not a managed webfinance.app host" };
  }

  const label = portalHostname.replace(/\.webfinance\.app$/i, "");
  if (!label || label.includes(".")) {
    return { skipped: true, hostname: portalHostname, reason: "unexpected hostname shape" };
  }

  const { host: target, siteId } = productTarget(productSku);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let dns: unknown = null;
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/dns_zones/${zoneId}/dns_records`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "CNAME",
        hostname: label,
        value: target,
        ttl: 3600,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 422 usually means record already exists
      dns = { status: res.status, body };
    } else {
      dns = body;
    }
  } catch (err) {
    dns = { error: err instanceof Error ? err.message : String(err) };
  }

  let alias: unknown = null;
  if (siteId) {
    try {
      const siteRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers });
      const site = await siteRes.json();
      const aliases: string[] = Array.isArray(site.domain_aliases) ? [...site.domain_aliases] : [];
      if (!aliases.includes(portalHostname)) aliases.push(portalHostname);
      const upd = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ domain_aliases: aliases }),
      });
      alias = await upd.json().catch(() => ({ status: upd.status }));
    } catch (err) {
      alias = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { hostname: portalHostname, target, dns, alias };
}
