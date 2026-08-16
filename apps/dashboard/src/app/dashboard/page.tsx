import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
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

  const { count: activeCount } = distributor
    ? await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("distributor_id", distributor.id)
        .eq("status", "active")
    : { count: 0 };

  return (
    <Shell companyName={distributor?.company_name}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Overview</h1>
        <p className="page-copy">
          Prepaid inventory is used first. Wallet wholesale balance covers Deploy when credits are empty.
        </p>
      </header>

      {!distributor ? (
        <div className="surface mt-8 animate-rise-delayed rounded-xl p-6 shadow-soft">
          <h2 className="font-display text-xl font-semibold text-ink-900">No distributor profile</h2>
          <p className="mt-2 text-sm text-ink-500">
            Finish signup or ask a platform admin to link your account before deploying clients.
          </p>
          <Link href="/signup" className="btn-primary mt-5">
            Complete signup
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8 animate-rise-delayed">
          <section className="grid gap-px overflow-hidden rounded-xl border border-sand-200 bg-sand-200 shadow-soft md:grid-cols-3">
            <div className="bg-white p-6">
              <p className="label">Wallet balance</p>
              <p className="metric-value mt-3">
                <span className="text-2xl text-ink-500">{distributor.currency}</span>{" "}
                {Number(distributor.wallet_balance).toFixed(2)}
              </p>
              <div className="mt-4">
                <StatusBadge status={distributor.status} />
              </div>
            </div>
            <div className="bg-white p-6">
              <p className="label">Clients</p>
              <p className="metric-value mt-3">{clientCount ?? 0}</p>
              <p className="mt-3 text-sm text-ink-500">
                {activeCount ?? 0} live across Product A &amp; B
              </p>
            </div>
            <div className="bg-white p-6">
              <p className="label">Next action</p>
              <p className="mt-3 font-display text-2xl font-semibold text-ink-900">
                Deploy a client
              </p>
              <Link href="/clients" className="btn-primary mt-5">
                Go to clients
              </Link>
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink-900">License pools</h2>
                <p className="mt-1 text-sm text-ink-500">Prepaid credits ready for zero-touch deploy.</p>
              </div>
              <Link href="/wallet" className="btn-secondary">
                View wallet
              </Link>
            </div>

            {(inventory ?? []).length === 0 ? (
              <div className="surface rounded-xl px-5 py-8 text-sm text-ink-500">
                No prepaid credits yet. Ask an admin to allocate inventory or top up your wallet.
              </div>
            ) : (
              <ul className="surface divide-y divide-sand-200 overflow-hidden rounded-xl">
                {(inventory as InventoryRow[]).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="font-semibold text-ink-900">
                        {row.products?.name ?? row.product_id}
                      </p>
                      <p className="text-xs uppercase tracking-[0.12em] text-ink-400">
                        {row.products?.sku ?? "SKU"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-3xl font-semibold text-brand-700">
                        {row.license_credits}
                      </p>
                      <p className="text-xs text-ink-500">
                        {row.licenses_consumed} consumed
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
