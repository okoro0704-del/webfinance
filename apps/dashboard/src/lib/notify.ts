import { createClient } from "@/lib/supabase/client";

export async function emitNotifyEvent(body: Record<string, unknown>) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  try {
    await fetch(`${base}/functions/v1/notify-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* non-blocking */
  }
}
