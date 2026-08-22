/**
 * Push client dashboard template + branding flags to MM/PM after CP edit.
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { provisionTenant } from "../_shared/tenantHandshake.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const userClient = createUserClient(authHeader);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  let body: { client_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const clientId = String(body.client_id ?? "").trim();
  if (!clientId) return jsonResponse({ error: "client_id required" }, 400);

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "platform_admin";

  const { data: callerDist } = await admin
    .from("distributors")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: client, error } = await admin
    .from("clients")
    .select("*, products(*)")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !client) return jsonResponse({ error: "Client not found" }, 404);

  if (!isAdmin && callerDist?.id !== client.distributor_id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const product = client.products as {
    sku: string;
    provision_base_url: string | null;
    metadata: Record<string, unknown>;
  } | null;
  if (!product?.sku) return jsonResponse({ error: "Client has no product" }, 400);

  const meta = (client.metadata ?? {}) as Record<string, unknown>;
  const brandingMeta = (meta.branding as Record<string, unknown> | undefined) ?? {};
  const brandName =
    (typeof brandingMeta.brand_name === "string" && brandingMeta.brand_name.trim()) ||
    String(client.display_name);
  const adminEmail =
    (typeof meta.admin_email === "string" && meta.admin_email.trim()) ||
    `admin@${client.slug}.webfinance.app`;
  const adminFullName =
    (typeof meta.admin_full_name === "string" && meta.admin_full_name.trim()) ||
    `${brandName} Admin`;

  try {
    const result = await provisionTenant(product, {
      clientId: client.id,
      distributorId: client.distributor_id,
      productSku: product.sku,
      displayName: client.display_name,
      slug: client.slug,
      customDomain: client.portal_hostname || client.custom_domain,
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
          brandingMeta.feature_flags && typeof brandingMeta.feature_flags === "object"
            ? (brandingMeta.feature_flags as Record<string, boolean>)
            : null,
      },
    });
    return jsonResponse({ ok: true, external_tenant_id: result.externalTenantId });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
});
