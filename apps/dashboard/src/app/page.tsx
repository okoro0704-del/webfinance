"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { usePartnerBrandFromHost } from "@/lib/partner-brand";

export default function HomePage() {
  const brand = usePartnerBrandFromHost();
  const whiteLabel = Boolean(brand?.company_name?.trim());
  const name = brand?.company_name?.trim() ?? "Webfinance";
  const isRetailer = brand?.partner_tier === "software_retailer";
  const partnerLabel = isRetailer ? "Retailer panel" : "Distributor panel";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 12% 8%, rgba(58,168,146,0.35), transparent 55%), linear-gradient(145deg, #0b141c 0%, #123c35 45%, #1f8a75 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-7 md:px-10 md:py-9">
        <header className="flex items-center justify-between gap-4">
          <BrandMark
            tone="light"
            brandName={whiteLabel ? name : null}
            partnerLabel={whiteLabel ? partnerLabel : null}
          />
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white sm:px-4"
            >
              Sign in
            </Link>
            {!whiteLabel ? (
              <Link
                href="/signup"
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-ink-900 transition hover:bg-sand-50 sm:px-4"
              >
                Get started
              </Link>
            ) : null}
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 md:py-20">
          <p className="animate-fade text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-200">
            {whiteLabel
              ? partnerLabel
              : "Master distributor control panel"}
          </p>
          <h1 className="animate-rise mt-5 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-7xl">
            {name}
          </h1>
          <p className="animate-rise-delayed mt-6 max-w-xl text-lg leading-relaxed text-sand-100/90 md:text-xl">
            {whiteLabel
              ? isRetailer
                ? "Deploy Money Movement and Parcel Movement for your clients with prepaid units — portals, domains, and credentials in one place."
                : "Provision Money Movement and Parcel Movement for your clients — licenses, domains, DNS/SSL, and tenant credentials in a single Deploy."
              : "Provision Money Movement and Parcel Movement clients end-to-end — licenses, domains, DNS/SSL, and tenant credentials in a single Deploy."}
          </p>
          {whiteLabel ? (
            <p className="animate-rise-delayed mt-3 text-sm text-white/55">
              Powered by WebFinance
            </p>
          ) : null}
          <div className="animate-rise-delayed mt-10 flex flex-wrap gap-3">
            {whiteLabel ? (
              <Link
                href="/login"
                className="rounded-md bg-white px-5 py-3.5 text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
              >
                Sign in to {name}
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="rounded-md bg-white px-5 py-3.5 text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
                >
                  Become a distributor
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-white/30 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Sign in to control panel
                </Link>
              </>
            )}
          </div>
        </section>

        <footer className="grid gap-4 border-t border-white/15 pt-6 text-sm text-white/60 md:grid-cols-3">
          {whiteLabel ? (
            <>
              <p>Your branded partner portal</p>
              <p>Deploy clients &amp; deliverables</p>
              <p>Connect domains with auto SSL</p>
            </>
          ) : (
            <>
              <p>Partner portals &amp; client deploy</p>
              <p>Self-serve domains with auto SSL</p>
              <p>Requests inbox to Master for fixes</p>
            </>
          )}
        </footer>
      </div>
    </main>
  );
}
