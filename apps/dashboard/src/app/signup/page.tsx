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

    // Create distributor row (pending until platform activates)
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={onSubmit} className="panel space-y-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-brand-600">Create account</p>
          <h1 className="mt-1 text-2xl font-semibold">Become a distributor</h1>
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Company</label>
          <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? "Creating…" : "Sign up"}
        </button>
        <p className="text-center text-sm text-ink-500">
          Already registered? <Link href="/login" className="text-brand-600">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
