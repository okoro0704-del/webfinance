/**
 * In-app notifications + Web Push delivery helpers for edge functions.
 */

type NotifyPayload = {
  title: string;
  body: string;
  kind?: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

type PushSub = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// deno-lint-ignore no-explicit-any
type AdminClient = any;

async function sendWebPush(
  sub: PushSub,
  payload: NotifyPayload,
): Promise<{ ok: boolean; status?: number; gone?: boolean }> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@webfinance.app";
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys missing — skipping web push");
    return { ok: false };
  }

  try {
    const webpush = await import("npm:web-push@3.6.7");
    webpush.setVapidDetails(subject, publicKey, privateKey);
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        href: payload.href ?? "/dashboard",
        kind: payload.kind ?? "general",
      }),
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return { ok: false, status, gone: true };
    console.error("web-push failed", err);
    return { ok: false, status };
  }
}

export async function notifyProfiles(
  admin: AdminClient,
  profileIds: string[],
  payload: NotifyPayload,
) {
  const unique = [...new Set(profileIds.filter(Boolean))];
  if (unique.length === 0) return;

  for (const profileId of unique) {
    await admin.rpc("create_notification", {
      p_profile_id: profileId,
      p_title: payload.title,
      p_body: payload.body,
      p_kind: payload.kind ?? "general",
      p_href: payload.href ?? null,
      p_metadata: payload.metadata ?? {},
    });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", unique);

  for (const sub of subs ?? []) {
    const result = await sendWebPush(sub, payload);
    if (result.gone) {
      await admin.from("push_subscriptions").delete().eq("id", sub.id);
    }
  }
}

export async function notifyPlatformAdmins(admin: AdminClient, payload: NotifyPayload) {
  const { data } = await admin.rpc("platform_admin_profile_ids", {});
  const ids = (Array.isArray(data) ? data : [])
    .map((row: unknown) => {
      if (typeof row === "string") return row;
      if (row && typeof row === "object") {
        const values = Object.values(row as Record<string, unknown>);
        const first = values[0];
        return typeof first === "string" ? first : null;
      }
      return null;
    })
    .filter((id: string | null): id is string => Boolean(id));
  await notifyProfiles(admin, ids, payload);
}
