"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { BrandMark } from "@/components/BrandMark";
import { PasswordField } from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: "distributor" } },
    });

    if (signErr || !data.user) {
      setLoading(false);
      setError(signErr?.message ?? "Signup failed");
      return;
    }

    const { error: distErr } = await supabase.from("distributors").insert({
      profile_id: data.user.id,
      company_name: companyName,
      contact_email: email,
      status: "pending",
    });

    setLoading(false);
    if (distErr) {
      setError(distErr.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthLayout
      eyebrow="Partner onboarding"
      headline="Create your distributor workspace and start provisioning."
      points={[
        "Manage Money Movement and Parcel Movement from one console",
        "Deploy tenants and manage portals for your clients",
        "Send Master a request when something needs fixing",
        "Accounts stay pending until platform activation",
      ]}
    >
      <div className="mb-8 lg:hidden">
        <BrandMark />
      </div>

      <form onSubmit={onSubmit} className="surface rounded-2xl p-6 shadow-soft sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          Get started
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-[2.1rem]">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Set up your distributor profile. An admin will activate Deploy access.
        </p>

        <div className="mt-8 grid gap-4">
          <div>
            <label className="label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              className="input"
              autoComplete="name"
              placeholder="Jordan Lee"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="company">
              Company name
            </label>
            <input
              id="company"
              className="input"
              autoComplete="organization"
              placeholder="Acme Distribution"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
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
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <PasswordField
            id="password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
          <p className="text-xs text-ink-400">Use at least 8 characters.</p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad"
          >
            {error}
          </div>
        ) : null}

        <button className="btn-primary mt-6 w-full py-3" type="submit" disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Creating account…
            </span>
          ) : (
            "Create distributor account"
          )}
        </button>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-sand-200 pt-5 text-sm">
          <p className="text-ink-500">Already registered?</p>
          <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
