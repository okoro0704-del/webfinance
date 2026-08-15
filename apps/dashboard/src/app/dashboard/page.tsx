import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/server";
import type { InventoryRow } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: distributor } = await supabase
    .from("distributors")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  const { data: inventory } = distributor
    ? await supabase
        .from("distributor_inventory")
        .select("*, products(id, sku, name, wholesale_unit_price)")
        .eq("distributor_id", distributor.id)
    : { data: [] as InventoryRow[] };

  const { count: clientCount } = distributor
    ? await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("distributor_id", distributor.id)
    : { count: 0 };

  return (
    <Shell companyName={distributor?.company_name}>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-ink-500">
          Prepaid inventory first; wallet wholesale as fallback on Deploy.
        </p>
      </header>

      {!distributor ? (
        <div className="panel p-6 text-sm text-ink-500">
          No distributor profile yet. Complete signup or ask a platform admin to link your account.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel p-5">
            <p className="label">Wallet balance</p>
            <p className="mt-2 text-3xl font-semibold">
              {distributor.currency} {Number(distributor.wallet_balance).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-ink-500">Status: {distributor.status}</p>
          </div>
          <div className="panel p-5">
            <p className="label">Clients</p>
            <p className="mt-2 text-3xl font-semibold">{clientCount ?? 0}</p>
            <p className="mt-1 text-xs text-ink-500">Across Product A & B</p>
          </div>
          <div className="panel p-5">
            <p className="label">License pools</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(inventory ?? []).length === 0 ? (
                <li className="text-ink-500">No prepaid credits yet</li>
              ) : (
                (inventory as InventoryRow[]).map((row) => (
                  <li key={row.id} className="flex justify-between">
                    <span>{row.products?.name ?? row.product_id}</span>
                    <span className="font-medium">{row.license_credits}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </Shell>
  );
}
