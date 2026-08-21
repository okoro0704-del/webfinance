"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function callRegisterPush(body: Record<string, unknown>, method: "POST" | "DELETE" = "POST") {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/functions/v1/register-push`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Push registration failed");
  return data;
}

export function PushNotificationSetup() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  const refreshSubscription = useCallback(async () => {
    if (!supported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setEnabled(Boolean(sub));
  }, [supported]);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  async function enable() {
    if (!vapidPublic) {
      setMessage("Push is not configured yet (missing VAPID public key).");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setMessage("Notification permission blocked.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic),
        });
      }
      const json = sub.toJSON();
      await callRegisterPush({
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: navigator.userAgent,
      });
      setEnabled(true);
      setMessage("Push notifications enabled.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not enable push");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await callRegisterPush({ endpoint: sub.endpoint }, "DELETE");
        await sub.unsubscribe();
      }
      setEnabled(false);
      setMessage("Push notifications disabled.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not disable push");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="surface rounded-xl p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Push notifications</h2>
        <p className="mt-2 text-sm text-ink-500">
          This browser does not support Web Push. Try Chrome or Edge on desktop, or install the
          app on your phone.
        </p>
      </div>
    );
  }

  return (
    <div className="surface rounded-xl p-5">
      <h2 className="font-display text-lg font-semibold text-ink-900">Push notifications</h2>
      <p className="mt-2 text-sm text-ink-500">
        Get alerts for sold units, deploys, and help-request updates — even when this tab is
        closed.
      </p>
      <p className="mt-2 text-xs text-ink-400">Permission: {permission}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!enabled ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void enable()}>
            {busy ? "Enabling…" : "Enable push"}
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void disable()}>
            {busy ? "Disabling…" : "Disable push"}
          </button>
        )}
      </div>
      {message ? <p className="mt-3 text-sm text-ink-700">{message}</p> : null}
    </div>
  );
}
