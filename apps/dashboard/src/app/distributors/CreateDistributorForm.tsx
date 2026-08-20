"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDistributor } from "@/lib/admin";
import { PasswordField } from "@/components/PasswordField";

export function CreateDistributorForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const result = await createDistributor({
        email,
        password,
        company_name: companyName,
        full_name: fullName || companyName,
        status: "active",
      });
      setOk(
        result.subdomain
          ? `Created ${result.email} → ${result.subdomain}`
          : `Created ${result.email} (${result.distributor_id})`,
      );
      setCompanyName("");
      setFullName("");
      setEmail("");
      setPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="surface rounded-xl p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Create distributor</h2>
      <p className="mt-1 text-sm text-ink-500">
        Provisions login credentials and activates the partner portal.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="company">
            Company name
          </label>
          <input
            id="company"
            className="input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="fullName">
            Contact name
          </label>
          <input
            id="fullName"
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <PasswordField
            id="tempPassword"
            label="Temporary password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
        </div>
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
        {loading ? "Creating…" : "Create distributor"}
      </button>
    </form>
  );
}
