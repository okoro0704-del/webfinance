"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, title, body, href, kind, read_at, created_at")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("profile_id", user.id)
        .is("read_at", null),
    ]);
    setRows((data as NotificationRow[]) ?? []);
    setUnread(count ?? 0);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(id);
  }, [load]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    void load();
  }

  async function markAllRead() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", user.id)
      .is("read_at", null);
    void load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-sand-200 bg-white text-ink-700 hover:border-brand-300"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" strokeLinecap="round" />
          <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-sand-200 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-sand-100 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-semibold text-brand-700"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-sand-100">
            {rows.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-500">No notifications yet.</li>
            ) : (
              rows.map((n) => (
                <li key={n.id} className={n.read_at ? "bg-white" : "bg-brand-50/40"}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="block px-3 py-2.5 hover:bg-sand-50"
                      onClick={() => {
                        void markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                      <p className="mt-0.5 text-xs text-ink-600">{n.body}</p>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="block w-full px-3 py-2.5 text-left hover:bg-sand-50"
                      onClick={() => void markRead(n.id)}
                    >
                      <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                      <p className="mt-0.5 text-xs text-ink-600">{n.body}</p>
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
