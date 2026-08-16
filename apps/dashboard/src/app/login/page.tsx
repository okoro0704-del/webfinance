"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { BrandMark } from "@/components/BrandMark";
import { PasswordField } from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signErr) {
      setError(signErr.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthLayout
      eyebrow="Distributor access"
      headline="Sign in and ship client environments in minutes."
      points={[
        "One-click Deploy for Product A and Product B",
        "Wallet + prepaid license inventory in one place",
        "Domain, DNS, SSL, and tenant handshake automated",
      ]}
    >
      <div className="mb-8 lg:hidden">
        <BrandMark />
      </div>

      <form
        onSubmit={onSubmit}
        className="surface rounded-2xl p-6 shadow-soft sm:p-8"
        noValidate
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          Welcome back
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-[2.1rem]">
          Sign in to Webfinance
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Enter your distributor email and password to open the control panel.
        </p>

        <div className="mt-8 space-y-4">
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

        <button className="btn-primary mt-6 w-full py-3" type="submit" disabled={loading}>
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Signing in…
            </span>
          ) : (
            "Sign in"
          )}
        </button>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-sand-200 pt-5 text-sm">
          <p className="text-ink-500">New partner?</p>
          <Link href="/signup" className="font-semibold text-brand-700 hover:text-brand-800">
            Create account
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
