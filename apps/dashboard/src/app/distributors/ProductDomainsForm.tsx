"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  client_portal_base_domain: string | null;
  metadata?: Record<string, unknown> | null;
};

export function ProductDomainsForm({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(products);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateRow(id: string, value: string) {
    setRows((prev) =>
      prev.map((p) => (p.id === id ? { ...p, client_portal_base_domain: value } : p)),
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOk(null);
    const supabase = createClient();

    for (const p of rows) {
      const domain = (p.client_portal_base_domain ?? "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      if (!domain) {
        setLoading(false);
        setError(`${p.name}: portal base domain is required`);
        return;
      }
      const { error: updErr } = await supabase
        .from("products")
        .update({
          client_portal_base_domain: domain,
          metadata: {
            ...(p.metadata ?? {}),
            host: domain,
            handshake_path:
              (p.metadata?.handshake_path as string | undefined) ??
              "/api/v1/tenants/provision",
            short_code:
              (p.metadata?.short_code as string | undefined) ??
              (p.sku === "PRODUCT_A" ? "MM" : "PM"),
          },
        })
        .eq("id", p.id);
      if (updErr) {
        setLoading(false);
        setError(updErr.message);
        return;
      }
    }

    setLoading(false);
    setOk("Product portal domains saved. New clients will use slug.{domain}.");
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="surface rounded-xl p-6 shadow-soft">
      <h2 className="font-display text-xl font-semibold text-ink-900">Product portal bases</h2>
      <p className="mt-1 text-sm text-ink-500">
        Platform free hostnames only (e.g. mm / pm). Clients become{" "}
        <span className="font-medium text-ink-700">slug.base</span>. Custom domain buy/connect stays
        with distributors and clients — not master purchase.
      </p>

      <div className="mt-6 space-y-4">
        {rows.map((p) => {
          const clean = (p.client_portal_base_domain || "domain")
            .replace(/^https?:\/\//, "")
            .replace(/\/+$/, "");
          return (
            <div key={p.id}>
              <label className="label" htmlFor={`portal-${p.id}`}>
                {p.name}
              </label>
              <input
                id={`portal-${p.id}`}
                className="input"
                value={p.client_portal_base_domain ?? ""}
                onChange={(e) => updateRow(p.id, e.target.value)}
                placeholder={p.sku === "PRODUCT_A" ? "mm.webfinance.app" : "pm.webfinance.app"}
                required
              />
              <p className="mt-1 text-xs text-ink-400">Preview: acme.{clean}</p>
            </div>
          );
        })}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="mt-5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-sm text-brand-800">
          {ok}
        </div>
      ) : null}

      <button className="btn-primary mt-6" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Save product domains"}
      </button>
    </form>
  );
}
