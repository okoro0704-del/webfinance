/**
 * Master admin: suspend / reactivate / soft-delete (cancel) a client.
 * Also best-effort syncs MM (mm.tenants) and PM (pm.companies) when linked.
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

type Action = "suspend" | "activate" | "delete";

type Body = {
  client_id?: string;
  action?: Action;
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const clientId = body.client_id?.trim();
  const action = body.action;
  if (!clientId) return jsonResponse({ error: "client_id is required" }, 400);
  if (action !== "suspend" && action !== "activate" && action !== "delete") {
    return jsonResponse({ error: "action must be suspend, activate, or delete" }, 400);
  }

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

  if (profile?.role !== "platform_admin") {
    return jsonResponse({ error: "Only Master admin can suspend or delete clients" }, 403);
  }

  const { data: client, error: clientErr } = await admin
    .from("clients")
    .select(
      "id, display_name, status, external_tenant_id, product_id, products!clients_product_id_fkey(sku)",
    )
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr || !client) {
    return jsonResponse({ error: clientErr?.message ?? "Client not found" }, 404);
  }

  const nextStatus =
    action === "suspend" ? "suspended" : action === "activate" ? "active" : "cancelled";

  if (client.status === nextStatus) {
    return jsonResponse({
      ok: true,
      client_id: client.id,
      status: nextStatus,
      reused: true,
    });
  }

  if (action === "activate" && client.status === "cancelled") {
    return jsonResponse(
      {
        error:
          "Cancelled clients cannot be reactivated. Create a new client instead.",
      },
      400,
    );
  }

  if (action === "activate" && client.status !== "suspended") {
    return jsonResponse(
      { error: `Only suspended clients can be reactivated (current: ${client.status})` },
      400,
    );
  }

  const { data: updated, error: updErr } = await admin
    .from("clients")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
      provision_error:
        action === "delete"
          ? `Cancelled by Master admin on ${new Date().toISOString()}`
          : action === "suspend"
            ? `Suspended by Master admin on ${new Date().toISOString()}`
            : null,
    })
    .eq("id", clientId)
    .select("id, status, display_name, external_tenant_id")
    .single();

  if (updErr || !updated) {
    return jsonResponse({ error: updErr?.message ?? "Failed to update client" }, 500);
  }

  const productRel = client.products as { sku?: string } | { sku?: string }[] | null;
  const sku = Array.isArray(productRel)
    ? productRel[0]?.sku
    : productRel?.sku;
  const externalId = client.external_tenant_id as string | null;

  const productSync: { target: string; ok: boolean; detail?: string }[] = [];

  if (externalId && !externalId.startsWith("pending-") && !externalId.startsWith("mock-")) {
    if (sku === "PRODUCT_A") {
      const mmStatus = action === "activate" ? "active" : "inactive";
      const { error } = await admin
        .schema("mm")
        .from("tenants")
        .update({ status: mmStatus, updated_at: new Date().toISOString() })
        .eq("id", externalId);
      productSync.push({
        target: "mm.tenants",
        ok: !error,
        detail: error?.message ?? mmStatus,
      });
    } else if (sku === "PRODUCT_B") {
      const pmStatus = action === "activate" ? "active" : "suspended";
      const { error } = await admin
        .schema("pm")
        .from("companies")
        .update({ status: pmStatus, updated_at: new Date().toISOString() })
        .eq("id", externalId);
      productSync.push({
        target: "pm.companies",
        ok: !error,
        detail: error?.message ?? pmStatus,
      });
    }
  }

  return jsonResponse({
    ok: true,
    client_id: updated.id,
    status: updated.status,
    product_sync: productSync,
  });
});
