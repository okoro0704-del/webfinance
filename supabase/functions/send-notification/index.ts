/**
 * Platform admin or system: send a notification to one or more profiles.
 * POST { profile_ids?: string[], distributor_id?: string, title, body, kind?, href? }
 */

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { notifyPlatformAdmins, notifyProfiles } from "../_shared/notify.ts";
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
  const title = String(body.title ?? "").trim();
  const message = String(body.body ?? "").trim();
  if (!title || !message) return jsonResponse({ error: "title and body required" }, 400);

  const payload = {
    title,
    body: message,
    kind: String(body.kind ?? "general"),
    href: typeof body.href === "string" ? body.href : "/dashboard",
    metadata: (body.metadata as Record<string, unknown>) ?? {},
  };

  const profileIds: string[] = Array.isArray(body.profile_ids)
    ? body.profile_ids.map(String)
    : [];

  if (body.distributor_id) {
    const { data: dist } = await admin
      .from("distributors")
      .select("profile_id")
      .eq("id", body.distributor_id)
      .maybeSingle();
    if (dist?.profile_id) profileIds.push(dist.profile_id);
  }

  if (body.to_admins) {
    await notifyPlatformAdmins(admin, payload);
  }

  if (profileIds.length > 0) {
    await notifyProfiles(admin, profileIds, payload);
  }

  return jsonResponse({ ok: true, recipients: profileIds.length + (body.to_admins ? "admins" : 0) });
});
