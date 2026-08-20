"use client";

import { useState } from "react";
import { PasswordField } from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setOk("Password updated.");
  }

  return (
    <form onSubmit={onSubmit} className="surface max-w-lg rounded-xl p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Change password</h2>
      <p className="mt-1 text-sm text-ink-500">Updates the password for your signed-in account.</p>

      <div className="mt-6 space-y-4">
        <PasswordField
          id="newPassword"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
        />
        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          {ok}
        </div>
      ) : null}

      <button className="btn-primary mt-6" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
