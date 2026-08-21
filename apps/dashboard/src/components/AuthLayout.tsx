import { BrandMark } from "@/components/BrandMark";

export function AuthLayout({
  children,
  eyebrow,
  headline,
  points,
  brandName,
  partnerLabel,
}: {
  children: React.ReactNode;
  eyebrow: string;
  headline: string;
  points: string[];
  brandName?: string | null;
  partnerLabel?: string | null;
}) {
  const whiteLabel = Boolean(brandName?.trim());

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 420px at 15% 10%, rgba(58,168,146,0.42), transparent 55%), radial-gradient(640px 380px at 90% 85%, rgba(255,255,255,0.08), transparent 50%), linear-gradient(155deg, #0b141c 0%, #123c35 46%, #1f8a75 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.22]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 35%, transparent 80%)",
          }}
        />

        <div className="relative z-10">
          <BrandMark
            tone="light"
            size="lg"
            brandName={brandName}
            partnerLabel={partnerLabel}
          />
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">
            {eyebrow}
          </p>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="font-display text-5xl font-semibold leading-[1.08] tracking-tight text-white xl:text-6xl">
            {headline}
          </h1>
          <ul className="mt-8 space-y-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-sand-100/90">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-sm bg-brand-300" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-12 overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-4 shadow-soft backdrop-blur-md">
            <div className="rounded-xl bg-ink-900/70 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-200">
                  Live deploy
                </p>
                <span className="rounded-md bg-brand-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-brand-200">
                  Running
                </span>
              </div>
              <div className="mt-4 space-y-2.5">
                {["License reserved", "Domain registered", "DNS + SSL ready", "Tenant provisioned"].map(
                  (step, i) => (
                    <div key={step} className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
                          i < 3 ? "bg-brand-500 text-white" : "bg-white/10 text-white/70"
                        }`}
                      >
                        {i < 3 ? "OK" : String(i + 1)}
                      </span>
                      <span className={`text-sm ${i < 3 ? "text-white" : "text-white/55"}`}>
                        {step}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs uppercase tracking-[0.16em] text-white/45">
          {whiteLabel ? "Powered by WebFinance" : "Secure partner workspace"}
        </p>
      </section>

      <section className="relative flex items-center justify-center px-4 py-10 sm:px-6 md:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 lg:hidden"
          style={{
            background:
              "radial-gradient(600px 320px at 50% 0%, rgba(31,138,117,0.16), transparent 60%)",
          }}
        />
        <div className="relative w-full max-w-[440px] animate-rise">{children}</div>
      </section>
    </main>
  );
}
