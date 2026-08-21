import Link from "next/link";

export function BrandMark({
  tone = "dark",
  size = "md",
  brandName,
  partnerLabel,
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  /** Partner company name — when set, panel is white-labeled. */
  brandName?: string | null;
  /** Optional subtitle under the brand (e.g. Distributor panel / Retailer panel). */
  partnerLabel?: string | null;
}) {
  const whiteLabel = Boolean(brandName?.trim());
  const title =
    size === "lg" ? "text-3xl md:text-4xl" : size === "sm" ? "text-xl" : "text-2xl";
  const text = tone === "light" ? "text-white" : "text-ink-900";
  const sub = tone === "light" ? "text-brand-200" : "text-brand-700";
  const powered = tone === "light" ? "text-white/55" : "text-ink-400";

  return (
    <Link href={whiteLabel ? "/dashboard" : "/"} className="inline-block min-w-0">
      <p className={`truncate font-display font-semibold tracking-tight ${title} ${text}`}>
        {whiteLabel ? brandName!.trim() : "WebFinance"}
      </p>
      {whiteLabel ? (
        <>
          {partnerLabel ? (
            <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${sub}`}>
              {partnerLabel}
            </p>
          ) : null}
          <p className={`mt-1 text-[10px] font-medium tracking-[0.04em] ${powered}`}>
            Powered by WebFinance
          </p>
        </>
      ) : (
        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${sub}`}>
          {partnerLabel ?? "Control panel"}
        </p>
      )}
    </Link>
  );
}
