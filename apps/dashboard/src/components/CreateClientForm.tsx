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

  function syncSlugFromName(name: string) {
    setDisplayName(name);
    if (!slug || slug === displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  }

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
      domain_status: "none",
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
    <form onSubmit={onSubmit} className="surface rounded-xl p-5 shadow-soft md:p-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl font-semibold text-ink-900">New client</h2>
        <p className="mt-1 text-sm text-ink-500">
          Create a draft tenant, then press Deploy to run the full provisioning pipeline.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => syncSlugFromName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="slug">Slug</label>
          <input
            id="slug"
            className="input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="domain">Custom domain</label>
          <input
            id="domain"
            className="input"
            placeholder="client.example.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="product">Product</label>
          <select
            id="product"
            className="input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ${Number(p.wholesale_unit_price).toFixed(2)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-signal-bad">{error}</p> : null}

      <div className="mt-5 flex justify-end">
        <button className="btn-primary" type="submit" disabled={loading || products.length === 0}>
          {loading ? "Saving…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
