import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #0f1720 0%, #14594c 48%, #1f8a75 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0 1px, transparent 1px), radial-gradient(circle at 80% 40%, rgba(255,255,255,0.12) 0 1px, transparent 1px)",
          backgroundSize: "28px 28px, 42px 42px",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 md:px-10 md:py-10">
        <header className="flex items-center justify-between">
          <p className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
            Webfinance
          </p>
          <Link
            href="/login"
            className="rounded-md border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Sign in
          </Link>
        </header>

        <section className="max-w-3xl py-16 md:py-24">
          <div className="section-rule animate-draw bg-brand-200" />
          <h1 className="animate-rise mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white md:text-7xl">
            Webfinance
          </h1>
          <p className="animate-rise-delayed mt-5 max-w-xl text-lg leading-relaxed text-sand-100 md:text-xl">
            Deploy Product A and Product B clients in one click — licenses, domains,
            DNS/SSL, and tenant handshake included.
          </p>
          <div className="animate-rise-delayed mt-10 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-md bg-white px-5 py-3 text-sm font-semibold text-ink-900 transition hover:bg-sand-50"
            >
              Become a distributor
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Open control panel
            </Link>
          </div>
        </section>

        <footer className="border-t border-white/15 pt-5 text-xs uppercase tracking-[0.16em] text-white/55">
          Master distributor control panel
        </footer>
      </div>
    </main>
  );
}
