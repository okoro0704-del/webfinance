"use client";

import type { DnsInstruction } from "@/lib/attachDomain";

const FALLBACK_TARGET = "edge.webfinance.app";

export function DomainDnsInstructions({
  domain,
  instructions,
  autoMode = false,
  target = FALLBACK_TARGET,
}: {
  domain: string;
  instructions?: DnsInstruction[];
  autoMode?: boolean;
  target?: string;
}) {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  if (!host) return null;

  const rows =
    instructions && instructions.length > 0
      ? instructions
      : [
          {
            type: "CNAME",
            name: host,
            value: target,
            purpose: "Send your website address to Webfinance",
          } satisfies DnsInstruction,
        ];

  return (
    <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50 px-4 py-4 text-sm text-ink-700">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">
        How to finish connecting
      </p>

      <ol className="mt-3 list-decimal space-y-3 pl-5 text-ink-700">
        <li>
          <span className="font-semibold text-ink-900">Open your domain account</span>
          <p className="mt-1 text-ink-600">
            Sign in where you bought the domain (Namecheap, GoDaddy, Google Domains, etc.).
          </p>
        </li>
        <li>
          <span className="font-semibold text-ink-900">Find DNS settings</span>
          <p className="mt-1 text-ink-600">
            Look for <strong>DNS</strong>, <strong>DNS management</strong>, or{" "}
            <strong>Advanced DNS</strong>.
          </p>
        </li>
        <li>
          <span className="font-semibold text-ink-900">Add this record</span>
          <p className="mt-1 text-ink-600">
            {autoMode
              ? "Copy the values below exactly. After DNS updates, we turn on HTTPS for you."
              : "You own and pay for this domain. Webfinance only uses it after you point DNS here."}
          </p>
          <ul className="mt-3 space-y-3">
            {rows.map((row, i) => (
              <li
                key={`${row.type}-${row.name}-${i}`}
                className="rounded-md border border-sand-200 bg-white px-3 py-2.5"
              >
                {row.purpose ? <p className="text-xs text-ink-500">{row.purpose}</p> : null}
                <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-[5.5rem_1fr]">
                  <dt className="font-semibold text-ink-500">Type</dt>
                  <dd className="font-mono text-ink-900">{row.type}</dd>
                  <dt className="font-semibold text-ink-500">Host / name</dt>
                  <dd className="break-all font-mono text-ink-900">{row.name}</dd>
                  <dt className="font-semibold text-ink-500">Points to</dt>
                  <dd className="break-all font-mono text-ink-900">{row.value}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <span className="font-semibold text-ink-900">Wait a little</span>
          <p className="mt-1 text-ink-600">
            Changes often take 5–60 minutes. Keep using your free{" "}
            <span className="font-medium text-ink-800">.webfinance.app</span> link until status says{" "}
            <strong>live</strong>.
          </p>
        </li>
      </ol>
    </div>
  );
}
