import Link from "next/link";

export function BrandMark({
  tone = "dark",
  size = "md",
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const title =
    size === "lg" ? "text-3xl md:text-4xl" : size === "sm" ? "text-xl" : "text-2xl";
  const text = tone === "light" ? "text-white" : "text-ink-900";
  const sub = tone === "light" ? "text-brand-200" : "text-brand-700";

  return (
    <Link href="/" className="inline-block">
      <p className={`font-display font-semibold tracking-tight ${title} ${text}`}>
        Webfinance
      </p>
      <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${sub}`}>
        Distributor control
      </p>
    </Link>
  );
}
