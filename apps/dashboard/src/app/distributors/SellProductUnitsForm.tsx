"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

async function sellUnits(input: { distributor_id: string; units: number }) {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/functions/v1/allocate-credits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      distributor_id: input.distributor_id,
      units: input.units,
      description: "Master sold deploy units to software retailer",
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    units_remaining?: number;
    inventory_remaining?: number;
  };
  if (!res.ok) throw new Error(data.error ?? "Sale failed");
  return data;
}

export function SellProductUnitsForm({
  distributorId,
  companyName,
  unitsRemaining,
}: {
  distributorId: string;
  companyName: string;
  /** @deprecated unused — kept for call-site compatibility */
  products?: unknown;
  inventory?: unknown;
  unitsRemaining: number;
}) {
  const router = useRouter();
  const [units, setUnits] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(units);
    if (!Number.isFinite(n) || n < 1) {
      setError("Enter at least 1 unit.");
      return;
    }
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const result = await sellUnits({
        distributor_id: distributorId,
        units: Math.round(n),
      });
      const remaining = result.units_remaining ?? result.inventory_remaining;
      setOk(`Sold ${Math.round(n)} deploy unit${Math.round(n) === 1 ? "" : "s"}. Stock now ${remaining ?? "—"}.`);
      setUnits("2");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg border border-sand-200 bg-sand-50/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        Sell deploy units to {companyName}
      </p>
      <p className="text-xs text-ink-500">
        Units are not tied to a product — the retailer chooses Money Movement or Parcel
        Movement when they deploy. Current stock: {unitsRemaining}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-[8rem]"
          type="number"
          min={1}
          max={500}
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          aria-label="Units to sell"
        />
        <button type="submit" className="btn-primary min-h-11 text-xs" disabled={loading}>
          {loading ? "Selling…" : "Sell units"}
        </button>
      </div>
      {error ? <p className="text-xs text-signal-bad">{error}</p> : null}
      {ok ? <p className="text-xs text-brand-800">{ok}</p> : null}
    </form>
  );
}
