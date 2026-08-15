"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

export function CreateClientForm({
  distributorId,
  products,
}: {
  distributorId: string;
  products: Product[];
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: insertErr } = await supabase.from("clients").insert({
      distributor_id: distributorId,
      product_id: productId,
      display_name: displayName,
      slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      custom_domain: domain || null,
      status: "draft",
      domain_status: domain ? "none" : "none",
    });
    setLoading(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setDisplayName("");
    setSlug("");
    setDomain("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <h2 className="text-base font-semibold">New client</h2>
        <p className="text-sm text-ink-500">Draft a tenant, then click Deploy.</p>
      </div>
      <div>
        <label className="label">Display name</label>
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Slug</label>
        <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </div>
      <div>
        <label className="label">Custom domain</label>
        <input
          className="input"
          placeholder="client.example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Product</label>
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (${p.wholesale_unit_price})
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
      <div className="md:col-span-2">
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
