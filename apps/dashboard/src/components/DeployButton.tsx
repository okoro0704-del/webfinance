"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deployClient } from "@/lib/deploy";

export function DeployButton({
  clientId,
  disabled,
  label,
  force,
  onDone,
}: {
  clientId: string;
  disabled?: boolean;
  label?: string;
  force?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDeploy() {
    setLoading(true);
    setError(null);
    try {
      await deployClient(clientId, { force });
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        className="btn-primary w-full min-w-[108px] sm:w-auto"
        disabled={disabled || loading}
        onClick={onDeploy}
      >
        {loading ? "Deploying…" : label || "Deploy"}
      </button>
      {error ? <p className="max-w-full text-left text-xs text-signal-bad sm:text-right">{error}</p> : null}
    </div>
  );
}
