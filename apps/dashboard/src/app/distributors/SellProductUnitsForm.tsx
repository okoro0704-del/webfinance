"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

async function sellUnits(input: {
  distributor_id: string;
  product_id: string;
  license_credits: number;
}) {
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
      ...input,
      description: "Master sold product units to software retailer",
    }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; inventory_remaining?: number };
  if (!res.ok) throw new Error(data.error ?? "Sale failed");
  return data;
}

export function SellProductUnitsForm({
  distributorId,
  companyName,
  products,
  inventory,
}: {
  distributorId: string;
  companyName: string;
  products: Product[];
  inventory: Array<{
    product_id: string;
    license_credits: number;
    products?: { sku?: string; name?: string } | null;
  }>;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [units, setUnits] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const remainingForSelected =
    inventory.find((i) => i.product_id === productId)?.license_credits ?? 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(units);
    if (!productId || !Number.isFinite(n) || n < 1) {
      setError("Choose a product and at least 1 unit.");
      return;
    }
    setLoading(true);
    setError(null);
    setOk(null);
    try {
      const result = await sellUnits({
        distributor_id: distributorId,
        product_id: productId,
        license_credits: Math.round(n),
      });
      const productName =
        products.find((p) => p.id === productId)?.name ?? "product";
      setOk(
        `Sold ${Math.round(n)} × ${productName}. Stock now ${result.inventory_remaining ?? "—"}.`,
      );
      setUnits("2");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sale failed");
    } finally {
      setLoading(false);
    }
  }

  if (products.length === 0) return null;

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-lg border border-sand-200 bg-sand-50/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
        Sell units to {companyName}
      </p>
      <div className="grid gap-2 sm:grid-cols-[1.4fr_0.6fr_auto]">
        <select
          className="input"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-label="Product"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku}) · have {inventory.find((i) => i.product_id === p.id)?.license_credits ?? 0}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={1}
          max={500}
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          aria-label="Units to sell"
        />
        <button type="submit" className="btn-primary min-h-11 text-xs" disabled={loading}>
          {loading ? "Selling…" : "Sell"}
        </button>
      </div>
      <p className="text-[11px] text-ink-500">
        Current stock for selected product: {remainingForSelected}
      </p>
      {error ? <p className="text-xs text-signal-bad">{error}</p> : null}
      {ok ? <p className="text-xs text-brand-800">{ok}</p> : null}
    </form>
  );
}
