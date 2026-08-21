"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emitNotifyEvent } from "@/lib/notify";

export function MasterRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(next: "in_progress" | "resolved" | "closed") {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const patch: Record<string, unknown> = { status: next };
    if (notes.trim()) patch.master_notes = notes.trim();
    if (next === "resolved" || next === "closed") {
      patch.resolved_at = new Date().toISOString();
    }
    const { error: updErr } = await supabase
      .from("support_requests")
      .update(patch)
      .eq("id", requestId);
    if (updErr) {
      setError(updErr.message);
      setLoading(false);
      return;
    }
    void emitNotifyEvent({ event: "support_request_updated", request_id: requestId });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="mt-3 space-y-2 border-t border-sand-200 pt-3">
      <textarea
        className="input min-h-[72px] text-sm"
        placeholder="Master notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <button
            type="button"
            className="btn-secondary min-h-10 text-xs"
            disabled={loading}
            onClick={() => setStatus("in_progress")}
          >
            Mark in progress
          </button>
        ) : null}
        {status !== "resolved" && status !== "closed" ? (
          <button
            type="button"
            className="btn-primary min-h-10 text-xs"
            disabled={loading}
            onClick={() => setStatus("resolved")}
          >
            Resolve
          </button>
        ) : null}
        {status !== "closed" ? (
          <button
            type="button"
            className="btn-secondary min-h-10 text-xs"
            disabled={loading}
            onClick={() => setStatus("closed")}
          >
            Close
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-signal-bad">{error}</p> : null}
    </div>
  );
}
