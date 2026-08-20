/**
 * Platform admin: create a distributor account (auth user + distributor row).
 * POST body:
 * {
 *   email: string,
 *   password: string,
 *   company_name: string,
 *   full_name?: string,
 *   status?: "pending" | "active",
 *   wallet_amount?: number,
 *   product_a_credits?: number,
 *   product_b_credits?: number
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
    return jsonResponse({ error: "Forbidden: platform admin only" }, 403);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const company_name = String(body.company_name ?? "").trim();
  const full_name = String(body.full_name ?? "").trim() || company_name;
  const status = body.status === "pending" ? "pending" : "active";

  if (!email || !password || !company_name) {
    return jsonResponse({ error: "email, password, and company_name are required" }, 400);
  }
  if (password.length < 8) {
    return jsonResponse({ error: "password must be at least 8 characters" }, 400);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: "distributor" },
  });

  if (createErr || !created.user) {
    return jsonResponse({ error: createErr?.message ?? "Failed to create auth user" }, 400);
  }

  // Profile row is created by trigger as distributor; keep it that way.
  await admin
    .from("profiles")
    .update({ full_name, role: "distributor" })
    .eq("id", created.user.id);

  const { data: distributor, error: distErr } = await admin
    .from("distributors")
    .insert({
      profile_id: created.user.id,
      company_name,
      contact_email: email,
      status,
      wallet_balance: 0,
    })
    .select("*")
    .single();

  if (distErr || !distributor) {
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: distErr?.message ?? "Failed to create distributor" }, 400);
  }

  const result: Record<string, unknown> = {
    ok: true,
    distributor_id: distributor.id,
    profile_id: created.user.id,
    email,
    status: distributor.status,
    subdomain: distributor.subdomain,
    subdomain_slot: distributor.subdomain_slot,
  };

  const walletAmount = Number(body.wallet_amount ?? 0);
  if (walletAmount > 0) {
    const { data, error } = await admin.rpc("credit_distributor_wallet", {
      p_distributor_id: distributor.id,
      p_amount: walletAmount,
      p_entry_type: "topup",
      p_description: "Initial wallet credit from master",
      p_actor: user.id,
    });
    if (error) return jsonResponse({ error: error.message, ...result }, 400);
    result.wallet_balance = data;
  }

  async function allocateSku(sku: string, credits: number) {
    if (credits <= 0) return;
    const { data: product } = await admin.from("products").select("id").eq("sku", sku).single();
    if (!product) throw new Error(`Product ${sku} not found`);
    const { data, error } = await admin.rpc("allocate_inventory_credits", {
      p_distributor_id: distributor.id,
      p_product_id: product.id,
      p_credits: credits,
      p_actor: user.id,
    });
    if (error) throw new Error(error.message);
    result[`${sku.toLowerCase()}_credits`] = data;
  }

  try {
    await allocateSku("PRODUCT_A", Number(body.product_a_credits ?? 0));
    await allocateSku("PRODUCT_B", Number(body.product_b_credits ?? 0));
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Credit allocation failed", ...result },
      400,
    );
  }

  return jsonResponse(result);
});
