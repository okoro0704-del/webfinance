/**
 * Platform-admin helper: top up wallet and/or allocate prepaid license credits.
 * POST body:
 * {
 *   distributor_id: string,
 *   product_id?: string,
 *   license_credits?: number,
 *   wallet_amount?: number,
 *   description?: string
 * }
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
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
  const { distributor_id, product_id, license_credits, wallet_amount, description } = body;

  if (!distributor_id) return jsonResponse({ error: "distributor_id required" }, 400);

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

  if (license_credits && product_id && Number(license_credits) > 0) {
    const { data, error } = await admin.rpc("allocate_inventory_credits", {
      p_distributor_id: distributor_id,
      p_product_id: product_id,
      p_credits: Number(license_credits),
      p_actor: user.id,
    });
    if (error) return jsonResponse({ error: error.message }, 400);
    result.inventory_remaining = data;
  }

  return jsonResponse({ ok: true, ...result });
});
