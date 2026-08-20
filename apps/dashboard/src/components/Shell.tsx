"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BrandMark } from "@/components/BrandMark";
import { InstallBanner } from "@/components/InstallBanner";
import { createClient } from "@/lib/supabase/client";

const baseLinks = [
  { href: "/dashboard", label: "Home", hint: "Overview", icon: "home" },
  { href: "/clients", label: "Clients", hint: "Deploy tenants", icon: "clients" },
  { href: "/domains", label: "Domains", hint: "Connect or buy", icon: "domains" },
  { href: "/requests", label: "Requests", hint: "Ask master for help", icon: "requests" },
  { href: "/account", label: "Account", hint: "Profile", icon: "account" },
];

const adminLink = {
  href: "/distributors",
  label: "Partners",
  hint: "Distributors",
  icon: "partners",
};

const adminRequestsLink = {
  href: "/requests",
  label: "Requests",
  hint: "Partner inbox",
  icon: "requests",
};

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
        </svg>
      );
    case "clients":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case "domains":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a1 1 0 0 1 1 1v2H7.5A2.5 2.5 0 0 0 5 10.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6h-5.5a1.5 1.5 0 0 0 0 3H20" />
        </svg>
      );
    case "requests":
      return (
        <svg {...common}>
          <path d="M4 6h16v12H4z" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      );
    case "account":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19.5c1.8-3.2 4.2-4.5 7-4.5s5.2 1.3 7 4.5" />
        </svg>
      );
    case "partners":
      return (
        <svg {...common}>
          <path d="M8 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
          <rect x="3" y="10" width="10" height="10" rx="2" />
        </svg>
      );
    default:
      return null;
  }
}

export function Shell({
  children,
  companyName,
  isAdmin = false,
}: {
  children: React.ReactNode;
  companyName?: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState(isAdmin);
  const [signingOut, setSigningOut] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isAdmin) {
      setAdmin(true);
      try {
        sessionStorage.setItem("wf_is_admin", "1");
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      if (sessionStorage.getItem("wf_is_admin") === "1") {
        setAdmin(true);
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      const next = data?.role === "platform_admin";
      setAdmin(next);
      try {
        sessionStorage.setItem("wf_is_admin", next ? "1" : "0");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      sessionStorage.removeItem("wf_is_admin");
    } catch {
      /* ignore */
    }

    startTransition(() => {
      router.replace("/login");
    });

    const supabase = createClient();
    void supabase.auth.signOut({ scope: "local" }).finally(() => {
      void supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
    });
  }

  const links = admin
    ? [
        baseLinks.find((l) => l.href === "/dashboard")!,
        baseLinks.find((l) => l.href === "/clients")!,
        adminLink,
        adminRequestsLink,
        baseLinks.find((l) => l.href === "/account")!,
      ]
    : baseLinks;

  // Prefer primary tabs on mobile bottom bar (max 5)
  const mobileLinks = admin
    ? [
        baseLinks.find((l) => l.href === "/dashboard")!,
        baseLinks.find((l) => l.href === "/clients")!,
        adminLink,
        adminRequestsLink,
        baseLinks.find((l) => l.href === "/account")!,
      ]
    : [
        baseLinks.find((l) => l.href === "/dashboard")!,
        baseLinks.find((l) => l.href === "/clients")!,
        baseLinks.find((l) => l.href === "/domains")!,
        baseLinks.find((l) => l.href === "/requests")!,
        baseLinks.find((l) => l.href === "/account")!,
      ];

  const sideNav = (
    <nav className="flex flex-col gap-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            prefetch
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
    <div className="app-shell min-h-dvh">
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
                {admin ? "Master workspace" : "Workspace"}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {companyName ?? "Unlinked account"}
              </p>
            </div>

            <div className="mt-8 flex-1">{sideNav}</div>

            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="mt-6 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-300 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-sand-200 bg-[#f7f5f1]/92 px-4 py-3 backdrop-blur-md pt-safe lg:hidden">
            <div className="min-w-0">
              <BrandMark size="sm" />
              <p className="mt-0.5 truncate text-[11px] font-medium text-ink-500">
                {companyName ?? (admin ? "Master" : "Distributor")}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="btn-secondary min-h-10 px-3 text-xs"
            >
              {signingOut ? "…" : "Sign out"}
            </button>
          </header>

          <main className="min-w-0 px-3 py-4 pb-mobile-nav sm:px-5 sm:py-6 md:px-8 md:py-8 lg:pb-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-[#f7f5f1]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
          {mobileLinks.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <li key={l.href} className="flex-1">
                <Link
                  href={l.href}
                  prefetch
                  className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold tracking-wide ${
                    active ? "text-brand-800" : "text-ink-400"
                  }`}
                >
                  <NavIcon name={l.icon} active={active} />
                  <span>{l.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <InstallBanner />
    </div>
  );
}
