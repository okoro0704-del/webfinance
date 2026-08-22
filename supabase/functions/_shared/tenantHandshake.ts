/**
 * Secure provisioning handshake to Repo 1 / Repo 2 backends.
 * Edge Function signs the request with a shared HMAC secret.
 */

export type TenantBranding = {
  brandName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  dashboardTemplate?: string | null;
  dashboardStyle?: string | null;
  featureFlags?: Record<string, boolean> | null;
};

export type TenantProvisionRequest = {
  clientId: string;
  distributorId: string;
  productSku: string;
  displayName: string;
  slug: string;
  customDomain: string | null;
  adminEmail: string;
  adminFullName: string;
  branding?: TenantBranding;
};

export type TenantProvisionResult = {
  externalTenantId: string;
  adminEmail: string;
  temporaryPassword?: string;
  accessUrl: string;
  raw?: unknown;
};

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function productEnvPrefix(sku: string): string {
  return sku.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export async function provisionTenant(
  product: { sku: string; provision_base_url: string | null; metadata: Record<string, unknown> },
  input: TenantProvisionRequest,
): Promise<TenantProvisionResult> {
  const prefix = productEnvPrefix(product.sku);
  const baseUrl =
    Deno.env.get(`${prefix}_PROVISION_URL`) ??
    product.provision_base_url ??
    null;

  const handshakePath =
    (product.metadata?.handshake_path as string | undefined) ?? "/api/v1/tenants/provision";

  if (!baseUrl) {
    if (Deno.env.get("ALLOW_MOCK_INTEGRATIONS") === "true") {
      return {
        externalTenantId: `mock-tenant-${input.clientId}`,
        adminEmail: input.adminEmail,
        temporaryPassword: crypto.randomUUID().slice(0, 12),
        accessUrl: `https://${input.customDomain ?? `${input.slug}.example.com`}`,
      };
    }
    throw new Error(`No provision URL configured for product ${product.sku}`);
  }

  const secret =
    Deno.env.get(`${prefix}_HMAC_SECRET`) ?? Deno.env.get("TENANT_HMAC_SECRET");
  if (!secret) throw new Error(`Missing HMAC secret for ${product.sku}`);

  const brandName = (input.branding?.brandName || input.displayName).slice(0, 120);
  const adminFullName = (input.adminFullName || brandName || "Tenant Admin").slice(0, 120);

  const body = {
    client_id: input.clientId,
    distributor_id: input.distributorId,
    product_sku: input.productSku,
    display_name: input.displayName,
    slug: input.slug,
    custom_domain: input.customDomain,
    portal_hostname: input.customDomain,
    apps_hostname: `${input.slug}.apps.webfinance.app`,
    admin_email: input.adminEmail,
    admin_full_name: adminFullName,
    // Branding for per-tenant login / chrome on MM & PM apps
    brand_name: brandName,
    company_name: brandName,
    logo_url: input.branding?.logoUrl || null,
    primary_color: input.branding?.primaryColor || null,
    accent_color: input.branding?.accentColor || null,
    branding: {
      brand_name: brandName,
      company_name: brandName,
      logo_url: input.branding?.logoUrl || null,
      primary_color: input.branding?.primaryColor || "#14594c",
      accent_color: input.branding?.accentColor || null,
      dashboard_template: input.branding?.dashboardTemplate || null,
      dashboard_style: input.branding?.dashboardStyle || null,
      feature_flags: input.branding?.featureFlags || null,
    },
    dashboard_template: input.branding?.dashboardTemplate || null,
    dashboard_style: input.branding?.dashboardStyle || null,
    feature_flags: input.branding?.featureFlags || null,
    timestamp: new Date().toISOString(),
  };
  const payload = JSON.stringify(body);
  const signature = await hmacSha256Hex(secret, payload);
  const timestamp = String(Date.now());

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${handshakePath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Distributor-Signature": signature,
      "X-Distributor-Timestamp": timestamp,
      "X-Idempotency-Key": input.clientId,
    },
    body: payload,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Tenant handshake failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`,
    );
  }

  return {
    externalTenantId: String(data.tenant_id ?? data.external_tenant_id),
    adminEmail: String(data.admin_email ?? input.adminEmail),
    temporaryPassword: data.temporary_password
      ? String(data.temporary_password)
      : undefined,
    accessUrl: String(
      data.access_url ?? `https://${input.customDomain ?? `${input.slug}.webfinance.app`}`,
    ),
    raw: data,
  };
}
