"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deployClient } from "@/lib/deploy";

export function DeployButton({
  clientId,
  disabled,
  onDone,
}: {
  clientId: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDeploy() {
    setLoading(true);
    setError(null);
    try {
      await deployClient(clientId, { purchaseDomain: true });
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={disabled || loading}
        onClick={onDeploy}
      >
        {loading ? "Deploying…" : "Deploy"}
      </button>
      {error ? <p className="max-w-[220px] text-right text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
