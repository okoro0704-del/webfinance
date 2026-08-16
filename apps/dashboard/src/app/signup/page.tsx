"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 360px at 80% 20%, rgba(58,168,146,0.3), transparent 60%), linear-gradient(160deg, #0f1720, #166f5e)",
          }}
        />
        <div className="relative">
          <p className="font-display text-3xl font-semibold text-white">Webfinance</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-brand-200">
            Partner onboarding
          </p>
        </div>
        <div className="relative max-w-md">
          <div className="section-rule bg-brand-300" />
          <p className="mt-5 font-display text-4xl font-semibold leading-tight text-white">
            Join the distributor network and deploy with confidence.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <form onSubmit={onSubmit} className="surface w-full max-w-md animate-rise rounded-xl p-7 shadow-soft md:p-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900">
            Create account
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Accounts start as pending until a platform admin activates them.
          </p>

          <div className="mt-8 grid gap-4">
            <div>
              <label className="label" htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="company">Company</label>
              <input
                id="company"
                className="input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-signal-bad">{error}</p> : null}

          <button className="btn-primary mt-6 w-full" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create distributor account"}
          </button>

          <p className="mt-5 text-center text-sm text-ink-500">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
