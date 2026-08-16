"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 360px at 20% 10%, rgba(58,168,146,0.35), transparent 60%), linear-gradient(160deg, #0f1720, #14594c)",
          }}
        />
        <div className="relative">
          <p className="font-display text-3xl font-semibold text-white">Webfinance</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-brand-200">
            Distributor access
          </p>
        </div>
        <div className="relative max-w-md">
          <div className="section-rule bg-brand-300" />
          <p className="mt-5 font-display text-4xl font-semibold leading-tight text-white">
            Provision clients without the ops grind.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="surface w-full max-w-md animate-rise rounded-xl p-7 shadow-soft md:p-8">
          <p className="font-display text-2xl font-semibold text-ink-900 lg:hidden">Webfinance</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-ink-500">Use your distributor credentials to continue.</p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-signal-bad">{error}</p> : null}

          <button className="btn-primary mt-6 w-full" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Continue"}
          </button>

          <p className="mt-5 text-center text-sm text-ink-500">
            No account?{" "}
            <Link href="/signup" className="font-semibold text-brand-700 hover:text-brand-800">
              Create one
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
