"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DomainDnsInstructions } from "@/components/DomainDnsInstructions";
import { callAttachDomain, type DnsInstruction } from "@/lib/attachDomain";

type Mode = "choose" | "connect" | "buy";

function cleanDomain(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/^www\./, "");
}

export function DomainSelfServePanel({
  title,
  subtitle,
  freeHostname,
  currentDomain,
  domainStatus,
  scope,
  entityId,
}: {
  title: string;
  subtitle: string;
  freeHostname?: string | null;
  currentDomain?: string | null;
  domainStatus?: string | null;
  scope: "distributor" | "client";
  entityId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(currentDomain ? "connect" : "choose");
  const [domain, setDomain] = useState(currentDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(domainStatus ?? "none");
  const [live, setLive] = useState(domainStatus === "live");
  const [instructions, setInstructions] = useState<DnsInstruction[]>([]);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }

  function startPoll(domainName: string) {
    stopPoll();
    setPolling(true);
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await callAttachDomain({
            scope,
            entityId,
            domain: domainName,
            action: "verify",
          });
          setStatus(res.domain_status ?? "dns_pending");
          if (res.instructions?.length) setInstructions(res.instructions);
          if (res.live) {
            setLive(true);
            setOk("Domain is live with SSL. You’re done.");
            stopPoll();
            router.refresh();
          }
        } catch {
          /* keep polling */
        }
      })();
    }, 8000);
  }

  useEffect(() => () => stopPoll(), []);

  useEffect(() => {
    if (currentDomain && domainStatus === "dns_pending") {
      setMode("connect");
      startPoll(currentDomain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveConnect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const cleaned = cleanDomain(domain);
    if (!cleaned || !cleaned.includes(".")) {
      setLoading(false);
      setError("Enter a valid domain like example.com");
      return;
    }

    try {
      const res = await callAttachDomain({
        scope,
        entityId,
        domain: cleaned,
        action: "attach",
      });
      setDomain(cleaned);
      setStatus(res.domain_status ?? "dns_pending");
      setLive(Boolean(res.live));
      setInstructions(res.instructions ?? []);
      setOk(
        res.message ??
          (res.live
            ? "Domain is live"
            : "Connected. Add the DNS record below — we finish HTTPS automatically."),
      );
      setMode("connect");
      if (!res.live) startPoll(cleaned);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach domain");
    } finally {
      setLoading(false);
    }
  }

  function openBuy() {
    const q = encodeURIComponent(cleanDomain(domain) || "mybusiness");
    window.open(`https://www.namecheap.com/domains/registration/results/?domain=${q}`, "_blank");
    setMode("buy");
    setOk(
      "Buy and pay on the seller’s site with your card. Then come back and tap “I bought it — Connect”.",
    );
  }

  async function clearDomain() {
    setLoading(true);
    setError(null);
    stopPoll();
    try {
      await callAttachDomain({ scope, entityId, action: "detach" });
      setDomain("");
      setStatus("none");
      setLive(false);
      setInstructions([]);
      setMode("choose");
      setOk("Reverted to free portal hostname.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not detach domain");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-soft sm:p-5">
      <h3 className="font-display text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-500">{subtitle}</p>

      <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50 px-3.5 py-3 text-sm text-ink-700">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
          Simple overview
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-600">
          <li>Use your free Webfinance address right away.</li>
          <li>Buy a personal domain yourself (or use one you already own).</li>
          <li>Connect it here, then add one DNS record at your domain seller.</li>
          <li>We finish the secure HTTPS setup automatically.</li>
        </ol>
      </div>

      {freeHostname ? (
        <p className="mt-3 text-sm text-ink-700">
          Free address (works now):{" "}
          <a
            className="font-semibold text-brand-700 hover:text-brand-800"
            href={`https://${freeHostname}`}
            target="_blank"
            rel="noreferrer"
          >
            {freeHostname}
          </a>
        </p>
      ) : null}

      {(currentDomain || domain) && status !== "none" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <span>
            Custom:{" "}
            <span className="font-semibold">{currentDomain || cleanDomain(domain)}</span>
          </span>
          <span
            className={`status-chip ${
              live || status === "live"
                ? "bg-brand-100 text-brand-800"
                : status === "failed"
                  ? "bg-red-100 text-signal-bad"
                  : "bg-amber-100 text-amber-900"
            }`}
          >
            {live || status === "live" ? "live" : polling ? `${status} · auto-checking` : status}
          </span>
        </div>
      ) : null}

      {mode === "choose" ? (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          <button type="button" className="btn-primary min-h-12 w-full sm:w-auto" onClick={() => setMode("connect")}>
            I already have a domain
          </button>
          <button type="button" className="btn-secondary min-h-12 w-full sm:w-auto" onClick={() => setMode("buy")}>
            I need to buy a domain
          </button>
        </div>
      ) : null}

      {mode === "connect" ? (
        <form onSubmit={saveConnect} className="mt-5 space-y-4">
          <p className="text-sm text-ink-600">
            Type the domain you own (for example <span className="font-medium text-ink-800">acme.com</span>),
            then press connect. After that, follow the numbered DNS steps.
          </p>
          <div>
            <label className="label" htmlFor={`domain-${scope}-${entityId}`}>
              Your domain
            </label>
            <input
              id={`domain-${scope}-${entityId}`}
              className="input min-h-12 text-base"
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <button className="btn-primary min-h-12 w-full sm:w-auto" type="submit" disabled={loading}>
              {loading ? "Connecting…" : "Connect domain"}
            </button>
            <button
              type="button"
              className="btn-secondary min-h-12 w-full sm:w-auto"
              onClick={() => setMode("choose")}
            >
              Back
            </button>
            {currentDomain ? (
              <button
                type="button"
                className="btn-secondary min-h-12 w-full sm:w-auto"
                onClick={clearDomain}
                disabled={loading}
              >
                Use free address only
              </button>
            ) : null}
          </div>
          <DomainDnsInstructions
            domain={currentDomain || cleanDomain(domain)}
            instructions={instructions}
            autoMode
          />
        </form>
      ) : null}

      {mode === "buy" ? (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed text-ink-600">
            You pay the domain seller directly with your own card. Webfinance does not charge for the
            domain. After you buy it, come back here and choose{" "}
            <strong>I bought it — Connect</strong>.
          </p>
          <div>
            <label className="label" htmlFor={`buy-${scope}-${entityId}`}>
              Domain to search
            </label>
            <input
              id={`buy-${scope}-${entityId}`}
              className="input min-h-12 text-base"
              placeholder="mybrand.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              autoCapitalize="none"
              inputMode="url"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <button type="button" className="btn-primary min-h-12 w-full sm:w-auto" onClick={openBuy}>
              Search on Namecheap
            </button>
            <button
              type="button"
              className="btn-secondary min-h-12 w-full sm:w-auto"
              onClick={() => setMode("connect")}
            >
              I bought it — Connect
            </button>
            <button
              type="button"
              className="btn-secondary min-h-12 w-full sm:w-auto"
              onClick={() => setMode("choose")}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          {ok}
        </div>
      ) : null}
    </div>
  );
}
