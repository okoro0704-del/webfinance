/**
 * Register or update a Web Push subscription for the signed-in user.
 * POST { endpoint, keys: { p256dh, auth }, user_agent? }
 * DELETE { endpoint }
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

  const userClient = createUserClient(authHeader);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const admin = createServiceClient();
  const body = await req.json().catch(() => ({}));

  if (req.method === "DELETE") {
    const endpoint = String(body.endpoint ?? "");
    if (!endpoint) return jsonResponse({ error: "endpoint required" }, 400);
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", user.id)
      .eq("endpoint", endpoint);
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? body.p256dh ?? "");
  const auth = String(body.keys?.auth ?? body.auth ?? "");
  const userAgent = typeof body.user_agent === "string" ? body.user_agent : null;

  if (!endpoint || !p256dh || !auth) {
    return jsonResponse({ error: "endpoint and keys required" }, 400);
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) return jsonResponse({ error: error.message }, 400);
  return jsonResponse({ ok: true });
});
