"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/clients", label: "Clients" },
  { href: "/wallet", label: "Wallet" },
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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[260px_1fr]">
        <aside className="relative border-b border-sand-200 bg-ink-900 text-sand-50 lg:min-h-screen lg:border-b-0 lg:border-r lg:border-ink-800">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(500px 280px at 10% 0%, rgba(58,168,146,0.35), transparent 60%)",
            }}
          />
          <div className="relative flex h-full flex-col px-5 py-6">
            <Link href="/dashboard" className="group block">
              <p className="font-display text-2xl font-semibold tracking-tight text-white">
                Webfinance
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-brand-200">
                Distributor control
              </p>
            </Link>

            <div className="mt-8 border-t border-white/10 pt-5">
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400">Workspace</p>
              <p className="mt-1 truncate text-sm font-medium text-sand-50">
                {companyName ?? "Unlinked account"}
              </p>
            </div>

            <nav className="mt-8 flex flex-1 flex-col gap-1">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`relative rounded-md px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-white/10 font-semibold text-white"
                        : "text-ink-200 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active ? (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" />
                    ) : null}
                    {l.label}
                  </Link>
                );
              })}
            </nav>

            <button type="button" onClick={signOut} className="btn-ghost mt-6 justify-start px-3 text-ink-300">
              Sign out
            </button>
          </div>
        </aside>

        <main className="px-4 py-6 md:px-8 md:py-8">
          <div className="animate-fade">{children}</div>
        </main>
      </div>
    </div>
  );
}
