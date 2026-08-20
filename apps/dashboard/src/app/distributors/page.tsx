import { redirect } from "next/navigation";
import { CreateDistributorForm } from "./CreateDistributorForm";
import { SellProductUnitsForm } from "./SellProductUnitsForm";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DistributorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const [{ data: distributor }, { data: partners }, { data: products }, { data: inventory }] =
    await Promise.all([
      supabase.from("distributors").select("company_name").eq("profile_id", user.id).maybeSingle(),
      supabase
        .from("distributors")
        .select(
          "id, company_name, contact_email, status, created_at, subdomain, subdomain_slot, is_master, partner_tier",
        )
        .order("is_master", { ascending: false })
        .order("subdomain_slot", { ascending: true }),
      supabase
        .from("products")
        .select("id, sku, name, wholesale_unit_price")
        .eq("is_active", true)
        .order("sku"),
      supabase
        .from("distributor_inventory")
        .select("distributor_id, product_id, license_credits, licenses_consumed, products(sku, name)"),
    ]);

  const inventoryByPartner = new Map<
    string,
    Array<{
      product_id: string;
      license_credits: number;
      products?: { sku?: string; name?: string } | null;
    }>
  >();
  for (const row of inventory ?? []) {
    const list = inventoryByPartner.get(row.distributor_id) ?? [];
    list.push({
      product_id: row.product_id,
      license_credits: row.license_credits,
      products: Array.isArray(row.products) ? row.products[0] : row.products,
    });
    inventoryByPartner.set(row.distributor_id, list);
  }

  return (
    <Shell companyName={distributor?.company_name ?? "Master control"} isAdmin>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Partners</h1>
        <p className="page-copy">
          Create Distributors (unlimited deploys) or Software Retailers (prepaid product
          units). After a retailer sells their starter stock, sell them more units below.
        </p>
      </header>

      <div className="mt-8 space-y-8 animate-rise-delayed">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <CreateDistributorForm />

          <section>
            <h2 className="font-display text-xl font-semibold text-ink-900">Partner roster</h2>
            <p className="mt-1 text-sm text-ink-500">
              Master HQ, distributors, and software retailers.
            </p>
            <ul className="surface mt-4 divide-y divide-sand-200 overflow-hidden rounded-xl">
              {(partners ?? []).length === 0 ? (
                <li className="px-5 py-8 text-sm text-ink-500">No partners yet.</li>
              ) : (
                (partners ?? []).map((d) => {
                  const tier = d.partner_tier ?? "distributor";
                  const stock = inventoryByPartner.get(d.id) ?? [];
                  const totalLeft = stock.reduce((sum, s) => sum + (s.license_credits ?? 0), 0);
                  return (
                    <li key={d.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">
                            {d.company_name}
                            {d.is_master ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                                Master
                              </span>
                            ) : tier === "software_retailer" ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                Retailer
                              </span>
                            ) : (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                                Distributor
                              </span>
                            )}
                          </p>
                          <p className="truncate text-sm text-ink-500">{d.contact_email}</p>
                          {d.is_master ? (
                            <p className="mt-1 text-xs font-semibold text-brand-700">
                              webfinance.app
                            </p>
                          ) : d.subdomain ? (
                            <a
                              className="mt-1 block truncate text-xs font-semibold text-brand-700 hover:text-brand-800"
                              href={`https://${d.subdomain}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {d.subdomain}
                            </a>
                          ) : null}
                          {!d.is_master ? (
                            <p className="mt-1 text-xs text-ink-500">
                              {tier === "software_retailer"
                                ? `${totalLeft} product unit${totalLeft === 1 ? "" : "s"} left`
                                : "Unlimited deployments"}
                            </p>
                          ) : null}
                        </div>
                        <StatusBadge status={d.status} />
                      </div>

                      {tier === "software_retailer" && !d.is_master ? (
                        <SellProductUnitsForm
                          distributorId={d.id}
                          companyName={d.company_name}
                          products={(products ?? []) as Product[]}
                          inventory={stock}
                        />
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
