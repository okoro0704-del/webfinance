"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Overview", hint: "Balance & inventory" },
  { href: "/clients", label: "Clients", hint: "Draft & deploy tenants" },
  { href: "/wallet", label: "Wallet", hint: "Ledger & invoices" },
];

export function Shell({
  children,
  companyName,
}: {
  children: React.ReactNode;
  companyName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={`relative rounded-lg px-3 py-2.5 transition ${
              active
                ? "bg-white/10 text-white"
                : "text-ink-200 hover:bg-white/5 hover:text-white"
            }`}
          >
            {active ? (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" />
            ) : null}
            <span className={`block text-sm ${active ? "font-semibold" : "font-medium"}`}>
              {l.label}
            </span>
            <span className="block text-[11px] text-white/45">{l.hint}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[280px_1fr]">
        <aside className="relative hidden bg-ink-900 text-sand-50 lg:flex lg:min-h-screen lg:flex-col">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(520px 300px at 0% 0%, rgba(58,168,146,0.32), transparent 60%)",
            }}
          />
          <div className="relative flex h-full flex-col px-5 py-7">
            <BrandMark tone="light" />

            <div className="mt-9 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                Workspace
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {companyName ?? "Unlinked account"}
              </p>
            </div>

            <div className="mt-8 flex-1">{nav}</div>

            <button
              type="button"
              onClick={signOut}
              className="mt-6 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sand-200 bg-[#f7f5f1]/90 px-4 py-3 backdrop-blur-md lg:hidden">
            <BrandMark size="sm" />
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Toggle navigation"
            >
              {open ? "Close" : "Menu"}
            </button>
          </header>

          {open ? (
            <div className="border-b border-sand-200 bg-ink-900 px-4 py-4 lg:hidden">
              <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                  Workspace
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {companyName ?? "Unlinked account"}
                </p>
              </div>
              {nav}
              <button
                type="button"
                onClick={signOut}
                className="mt-4 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : null}

          <main className="px-4 py-6 sm:px-6 md:px-8 md:py-8">
            <div className="animate-fade">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
