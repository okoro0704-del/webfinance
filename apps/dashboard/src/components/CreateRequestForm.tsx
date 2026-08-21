"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emitNotifyEvent } from "@/lib/notify";
import { useToast } from "@/components/Toast";

export function CreateRequestForm({
  distributorId,
  clients,
}: {
  distributorId: string;
  clients: Array<{ id: string; display_name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      setError("Not signed in");
      return;
    }

    const { data: created, error: insErr } = await supabase
      .from("support_requests")
      .insert({
        distributor_id: distributorId,
        client_id: clientId || null,
        created_by: user.id,
        subject: subject.trim(),
        body: body.trim(),
        status: "open",
      })
      .select("id")
      .single();

    if (insErr) {
      setLoading(false);
      setError(insErr.message);
      return;
    }

    if (created?.id) {
      void emitNotifyEvent({ event: "support_request_created", request_id: created.id });
    }

    setSubject("");
    setBody("");
    setClientId("");
    setOk("Request sent to Master.");
    toast.success("Request sent to Master.");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="surface rounded-xl p-5 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Ask Master for help</h2>
      <p className="mt-1 text-sm text-ink-500">
        Report a broken deploy, domain issue, or anything else — Master sees it in Requests.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="req-subject">
            Subject
          </label>
          <input
            id="req-subject"
            className="input min-h-12 text-base"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Deploy failed for …"
            required
          />
        </div>
        {clients.length > 0 ? (
          <div>
            <label className="label" htmlFor="req-client">
              Related client (optional)
            </label>
            <select
              id="req-client"
              className="input min-h-12 text-base"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">None</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="req-body">
            Details
          </label>
          <textarea
            id="req-body"
            className="input min-h-[120px] text-base"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What should Master fix or check?"
            required
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          {ok}
        </div>
      ) : null}

      <button className="btn-primary mt-5 w-full sm:w-auto" type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}
