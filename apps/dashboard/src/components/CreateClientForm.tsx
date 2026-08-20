"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

export function CreateClientForm({
  distributorId,
  products,
  inventoryByProductId,
  isRetailer = false,
}: {
  distributorId: string;
  products: Product[];
  productPortalBases?: Record<string, string>;
  /** Remaining prepaid units per product (retailers only). */
  inventoryByProductId?: Record<string, number>;
  isRetailer?: boolean;
}) {
  const router = useRouter();
  const stockedProducts = isRetailer
    ? products.filter((p) => (inventoryByProductId?.[p.id] ?? 0) > 0)
    : products;
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#14594c");
  const [productId, setProductId] = useState(stockedProducts[0]?.id ?? products[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  function syncSlugFromName(name: string) {
    setDisplayName(name);
    const autoFromPrevious = toSlug(displayName);
    if (!slug || slug === autoFromPrevious) {
      setSlug(toSlug(name));
    }
    if (!brandName || brandName === displayName) {
      setBrandName(name);
    }
    if (!adminFullName || adminFullName === `${displayName} Admin`) {
      setAdminFullName(name ? `${name} Admin` : "");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (isRetailer && (inventoryByProductId?.[productId] ?? 0) <= 0) {
      setLoading(false);
      setError("No units left for this product. Ask Master to sell you more before creating a client.");
      return;
    }
    const supabase = createClient();
    let nextSlug = toSlug(slug || displayName);
    if (!nextSlug) {
      setLoading(false);
      setError("Slug is required.");
      return;
    }

    const brand = (brandName.trim() || displayName).slice(0, 120);
    const fullName = (adminFullName.trim() || `${brand} Admin`).slice(0, 120);

    let insertErr: { message: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = attempt === 0 ? nextSlug : `${nextSlug}-${attempt + 1}`;
      const { error } = await supabase.from("clients").insert({
        distributor_id: distributorId,
        product_id: productId,
        display_name: displayName,
        slug: candidate,
        custom_domain: null,
        status: "draft",
        domain_status: "none",
        metadata: {
          admin_email: adminEmail.trim() || `admin@${candidate}.webfinance.app`,
          admin_full_name: fullName,
          branding: {
            brand_name: brand,
            company_name: brand,
            logo_url: logoUrl.trim() || null,
            primary_color: primaryColor.trim() || "#14594c",
          },
        },
      });
      if (!error) {
        insertErr = null;
        nextSlug = candidate;
        setSlug(candidate);
        break;
      }
      insertErr = error;
      const isDuplicate =
        error.code === "23505" ||
        /clients_distributor_id_slug_key|duplicate key/i.test(error.message);
      if (!isDuplicate) break;
    }

    setLoading(false);
    if (insertErr) {
      const isDuplicate =
        insertErr.code === "23505" ||
        /clients_distributor_id_slug_key|duplicate key/i.test(insertErr.message);
      setError(
        isDuplicate
          ? `Slug "${toSlug(slug || displayName)}" is already used. Pick a different slug.`
          : insertErr.message,
      );
      return;
    }
    setDisplayName("");
    setSlug("");
    setAdminEmail("");
    setAdminFullName("");
    setBrandName("");
    setLogoUrl("");
    setPrimaryColor("#14594c");
    router.refresh();
    router.push("/clients");
  }

  return (
    <form onSubmit={onSubmit} className="surface rounded-xl p-4 shadow-soft sm:p-5 md:p-6">
      <div className="mb-4 sm:mb-5">
        <h2 className="font-display text-xl font-semibold text-ink-900 sm:text-2xl">New client</h2>
        <p className="mt-2 text-sm text-ink-500">
          Create a draft tenant, then open it in the list and Deploy. Their product login uses the
          branding below.
          {isRetailer
            ? " Each Deploy uses one prepaid product unit from your stock."
            : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="displayName">
            Company / display name
          </label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => syncSlugFromName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="slug">
           Slug
          </label>
          <input
            id="slug"
            className="input"
            value={slug}
            onChange={(e) => setSlug(toSlug(e.target.value))}
            required
          />
          <p className="mt-1 text-xs text-ink-400">
            Portal:{" "}
            <span className="font-medium text-ink-700">
              {(slug || "client-name").replace(/[^a-z0-9-]+/g, "-") || "client-name"}
              .webfinance.app
            </span>
          </p>
        </div>
        <div>
          <label className="label" htmlFor="brandName">
            Brand name (login screen)
          </label>
          <input
            id="brandName"
            className="input"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Miami Security"
          />
        </div>
        <div>
          <label className="label" htmlFor="primaryColor">
            Brand color
          </label>
          <div className="flex gap-2">
            <input
              id="primaryColor"
              className="input max-w-[7rem] font-mono"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#14594c"
            />
            <input
              type="color"
              aria-label="Pick brand color"
              className="h-12 w-12 cursor-pointer rounded-lg border border-sand-200 bg-white p-1"
              value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : "#14594c"}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="logoUrl">
            Logo URL (optional)
          </label>
          <input
            id="logoUrl"
            className="input"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
          />
        </div>
        <div>
          <label className="label" htmlFor="adminFullName">
            Tenant admin full name
          </label>
          <input
            id="adminFullName"
            className="input"
            value={adminFullName}
            onChange={(e) => setAdminFullName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="adminEmail">
            Tenant admin email
          </label>
          <input
            id="adminEmail"
            className="input"
            type="email"
            placeholder="admin@client.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-400">
            Defaults to admin@slug.webfinance.app — this is their product app login.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="product">
            Product
          </label>
          <select
            id="product"
            className="input"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={isRetailer && stockedProducts.length === 0}
          >
            {products.map((p) => {
              const left = inventoryByProductId?.[p.id];
              const soldOut = isRetailer && (left ?? 0) <= 0;
              return (
                <option key={p.id} value={p.id} disabled={soldOut}>
                  {p.name}
                  {isRetailer
                    ? soldOut
                      ? " · sold out"
                      : ` · ${left ?? 0} unit${(left ?? 0) === 1 ? "" : "s"} left`
                    : ""}
                </option>
              );
            })}
          </select>
          {isRetailer && stockedProducts.length === 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              Stock empty — ask Master (Partners → Sell units) before creating more clients.
            </p>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-signal-bad">{error}</p> : null}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          className="btn-primary w-full sm:w-auto"
          type="submit"
          disabled={loading || products.length === 0 || (isRetailer && stockedProducts.length === 0)}
        >
          {loading ? "Saving…" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
