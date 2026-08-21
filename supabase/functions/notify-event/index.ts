/**
 * Authenticated event hooks that fan out in-app + push notifications.
 * POST { event, ...payload }
 *
 * Events:
 * - support_request_created { request_id }
 * - support_request_updated { request_id }  (platform admin)
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
  const isAdmin = profile?.role === "platform_admin";

  const body = await req.json();
  const event = String(body.event ?? "");

  if (event === "support_request_created") {
    const requestId = String(body.request_id ?? "");
    if (!requestId) return jsonResponse({ error: "request_id required" }, 400);

    const { data: row } = await admin
      .from("support_requests")
      .select("id, subject, created_by, distributor_id, distributors(company_name)")
      .eq("id", requestId)
      .maybeSingle();

    if (!row) return jsonResponse({ error: "Request not found" }, 404);
    if (!isAdmin && row.created_by !== user.id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const company =
      (row.distributors as { company_name?: string } | null)?.company_name ?? "Partner";

    await notifyPlatformAdmins(admin, {
      title: "New help request",
      body: `${company}: ${row.subject}`,
      kind: "support_request",
      href: "/requests",
      metadata: { request_id: row.id },
    });
    return jsonResponse({ ok: true });
  }

  if (event === "support_request_updated") {
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
    const requestId = String(body.request_id ?? "");
    if (!requestId) return jsonResponse({ error: "request_id required" }, 400);

    const { data: row } = await admin
      .from("support_requests")
      .select("id, subject, status, created_by, distributor_id, distributors(profile_id, company_name)")
      .eq("id", requestId)
      .maybeSingle();

    if (!row) return jsonResponse({ error: "Request not found" }, 404);

    const dist = row.distributors as { profile_id?: string; company_name?: string } | null;
    const target = dist?.profile_id ?? row.created_by;
    if (target) {
      await notifyProfiles(admin, [target], {
        title: "Request updated",
        body: `"${row.subject}" is now ${row.status}.`,
        kind: "support_request",
        href: "/requests",
        metadata: { request_id: row.id, status: row.status },
      });
    }
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: `Unknown event: ${event}` }, 400);
});
