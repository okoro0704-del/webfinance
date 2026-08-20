"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Action = "suspend" | "activate" | "delete";

async function setClientStatus(clientId: string, action: Action) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/functions/v1/set-client-status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, action }),
  });

  const data = (await res.json()) as { ok?: boolean; error?: string; status?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to update client");
  }
  return data;
}

export function ClientLifecycleActions({
  clientId,
  displayName,
  status,
}: {
  clientId: string;
  displayName: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCancelled = status === "cancelled";
  const isSuspended = status === "suspended";
  const canSuspend = !isCancelled && !isSuspended && status !== "draft";
  const canActivate = isSuspended;
  const canDelete = !isCancelled;

  async function run(action: Action) {
    setLoading(action);
    setError(null);
    try {
      await setClientStatus(clientId, action);
      setConfirmDelete(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update client");
    } finally {
      setLoading(null);
    }
  }

  if (isCancelled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 text-xs text-signal-bad">
        This client is cancelled and can no longer be deployed or reactivated.
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t border-sand-200 pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        Master controls
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {canSuspend ? (
          <button
            type="button"
            className="btn-secondary min-h-10 text-xs"
            disabled={loading !== null}
            onClick={() => void run("suspend")}
          >
            {loading === "suspend" ? "Suspending…" : "Suspend"}
          </button>
        ) : null}
        {canActivate ? (
          <button
            type="button"
            className="btn-primary min-h-10 text-xs"
            disabled={loading !== null}
            onClick={() => void run("activate")}
          >
            {loading === "activate" ? "Reactivating…" : "Reactivate"}
          </button>
        ) : null}
        {canDelete && !confirmDelete ? (
          <button
            type="button"
            className="btn min-h-10 border border-red-200 bg-red-50 text-xs font-semibold text-signal-bad hover:bg-red-100"
            disabled={loading !== null}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-ink-800">
          <p className="font-medium text-signal-bad">Delete {displayName}?</p>
          <p className="mt-1 text-xs text-ink-600">
            This cancels the client in Control Plane and suspends the live product
            tenant. It cannot be undone from here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn min-h-10 bg-signal-bad px-3 text-xs font-semibold text-white hover:opacity-90"
              disabled={loading !== null}
              onClick={() => void run("delete")}
            >
              {loading === "delete" ? "Deleting…" : "Yes, delete client"}
            </button>
            <button
              type="button"
              className="btn-secondary min-h-10 text-xs"
              disabled={loading !== null}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-signal-bad">{error}</p> : null}
    </div>
  );
}
