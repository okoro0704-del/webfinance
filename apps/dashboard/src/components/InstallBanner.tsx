"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallBanner({ brandName }: { brandName?: string | null }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);
  const label = brandName?.trim() || "WebFinance";

  useEffect(() => {
    try {
      if (sessionStorage.getItem("wf_hide_install") === "1") return;
    } catch {
      /* ignore */
    }
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS
      window.navigator.standalone === true;
    if (isStandalone) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    // iOS: show soft tip after a short delay
    const t = window.setTimeout(() => {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/.test(ua)) setHidden(false);
    }, 2500);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(t);
    };
  }, []);

  if (hidden) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    }
    dismiss();
  }

  function dismiss() {
    setHidden(true);
    try {
      sessionStorage.setItem("wf_hide_install", "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-x-3 z-40 rounded-xl border border-sand-200 bg-white/95 p-3 shadow-soft backdrop-blur-md lg:hidden"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
    >
      <p className="text-sm font-semibold text-ink-900">Install {label}</p>
      <p className="mt-0.5 text-xs text-ink-500">
        {deferred
          ? "Add to your home screen for a full-screen app experience."
          : "On iPhone: Share → Add to Home Screen."}
        {brandName?.trim() ? (
          <span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-ink-400">
            Powered by WebFinance
          </span>
        ) : null}
      </p>
      <div className="mt-3 flex gap-2">
        {deferred ? (
          <button type="button" className="btn-primary min-h-10 flex-1 text-sm" onClick={install}>
            Install
          </button>
        ) : null}
        <button type="button" className="btn-secondary min-h-10 flex-1 text-sm" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
