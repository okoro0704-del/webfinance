/**
 * Platform-admin helper: top up wallet and/or allocate prepaid deploy units.
 * POST body:
 * {
 *   distributor_id: string,
 *   units?: number,              // generic deploy units (preferred)
 *   license_credits?: number,    // alias of units
 *   product_id?: string,         // ignored for unit sales (kept for compat)
 *   wallet_amount?: number,
 *   description?: string
 * }
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { notifyProfiles } from "../_shared/notify.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const userClient = createUserClient(authHeader);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "platform_admin") {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const body = await req.json();
  const { distributor_id, product_id: _productId, wallet_amount, description } = body;
  const units = Number(body.units ?? body.license_credits ?? 0);

  if (!distributor_id) return jsonResponse({ error: "distributor_id required" }, 400);

  const { data: partner } = await admin
    .from("distributors")
    .select("id, company_name, profile_id, partner_tier")
    .eq("id", distributor_id)
    .maybeSingle();

  if (!partner) return jsonResponse({ error: "Partner not found" }, 404);

  const result: Record<string, unknown> = {};

  if (wallet_amount && Number(wallet_amount) > 0) {
    const { data, error } = await admin.rpc("credit_distributor_wallet", {
      p_distributor_id: distributor_id,
      p_amount: Number(wallet_amount),
      p_entry_type: "topup",
      p_description: description ?? "Admin wallet top-up",
      p_actor: user.id,
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    result.wallet_balance = data;
  }

  if (units > 0) {
    const { data, error } = await admin.rpc("allocate_deploy_units", {
      p_distributor_id: distributor_id,
      p_units: Math.round(units),
      p_actor: user.id,
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    result.units_remaining = data;
    result.inventory_remaining = data; // backward-compatible alias

    if (partner.profile_id) {
      await notifyProfiles(admin, [partner.profile_id], {
        title: "Deploy units added",
        body: `Master sold you ${Math.round(units)} deploy unit${Math.round(units) === 1 ? "" : "s"}. Stock now ${data}.`,
        kind: "units_sold",
        href: "/clients",
        metadata: { units: Math.round(units), remaining: data, distributor_id },
      });
    }
  }

  return jsonResponse({ ok: true, ...result });
});
