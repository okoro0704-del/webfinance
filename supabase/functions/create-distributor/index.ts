/**
 * Platform admin: create a distributor or software retailer account.
 * POST body:
 * {
 *   email, password, company_name, full_name?,
 *   status?: "pending" | "active",
 *   partner_tier?: "distributor" | "software_retailer",
 *   wallet_amount?: number,
 *   starter_units?: number,   // retailers default to 2 (product-agnostic)
 *   product_a_credits?: number, // legacy ignored — folded into starter_units
 *   product_b_credits?: number
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
    return jsonResponse({ error: "Forbidden: platform admin only" }, 403);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const company_name = String(body.company_name ?? "").trim();
  const full_name = String(body.full_name ?? "").trim() || company_name;
  const status = body.status === "pending" ? "pending" : "active";
  const partner_tier =
    body.partner_tier === "software_retailer" ? "software_retailer" : "distributor";

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
    user_metadata: { full_name, role: "distributor", partner_tier },
  });

  if (createErr || !created.user) {
    return jsonResponse({ error: createErr?.message ?? "Failed to create auth user" }, 400);
  }

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
      partner_tier,
      deploy_units: 0,
    })
    .select("*")
    .single();

  if (distErr || !distributor) {
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: distErr?.message ?? "Failed to create partner" }, 400);
  }

  const result: Record<string, unknown> = {
    ok: true,
    distributor_id: distributor.id,
    profile_id: created.user.id,
    email,
    status: distributor.status,
    partner_tier: distributor.partner_tier,
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

  // Retailers start with 2 product-agnostic deploy units (Master may override).
  let starterUnits = 0;
  if (partner_tier === "software_retailer") {
    if (body.starter_units !== undefined && body.starter_units !== null) {
      starterUnits = Math.max(0, Math.round(Number(body.starter_units)));
    } else {
      const legacyA = Number(body.product_a_credits ?? 0);
      const legacyB = Number(body.product_b_credits ?? 0);
      starterUnits = legacyA + legacyB > 0 ? Math.round(legacyA + legacyB) : 2;
    }
  }

  if (starterUnits > 0) {
    const { data, error } = await admin.rpc("allocate_deploy_units", {
      p_distributor_id: distributor.id,
      p_units: starterUnits,
      p_actor: user.id,
    });
    if (error) {
      return jsonResponse(
        { error: error.message, ...result },
        400,
      );
    }
    result.deploy_units = data;
    result.starter_units = starterUnits;
  }

  await notifyProfiles(admin, [created.user.id], {
    title:
      partner_tier === "software_retailer"
        ? "Software Retailer account ready"
        : "Distributor account ready",
    body:
      partner_tier === "software_retailer"
        ? `Welcome — you start with ${starterUnits} deploy units usable on any product.`
        : "Welcome — you can deploy unlimited client tenants.",
    kind: "partner_created",
    href: "/dashboard",
  });

  return jsonResponse(result);
});
