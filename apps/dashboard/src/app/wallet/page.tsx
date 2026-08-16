import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";

export default async function WalletPage() {
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

  if (!distributor) {
    return (
      <Shell>
        <div className="surface rounded-xl p-6 text-sm text-ink-500">
          Distributor profile required.
        </div>
      </Shell>
    );
  }

  const [{ data: ledger }, { data: invoices }] = await Promise.all([
    supabase
      .from("wallet_ledger")
      .select("*")
      .eq("distributor_id", distributor.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoices")
      .select("*")
      .eq("distributor_id", distributor.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <Shell companyName={distributor.company_name}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Wallet</h1>
        <p className="page-copy">
          Append-only ledger for credits and license debits. Balance is cached on your distributor profile.
        </p>
      </header>

      <section className="surface mt-8 animate-rise-delayed overflow-hidden rounded-xl shadow-soft">
        <div className="bg-ink-900 px-6 py-7 text-white">
          <p className="text-[11px] uppercase tracking-[0.16em] text-brand-200">Available balance</p>
          <p className="mt-3 font-display text-5xl font-semibold tracking-tight">
            <span className="text-2xl text-ink-200">{distributor.currency}</span>{" "}
            {Number(distributor.wallet_balance).toFixed(2)}
          </p>
        </div>
      </section>

      <div className="mt-8 grid gap-6 animate-rise-delayed lg:grid-cols-2">
        <section className="surface overflow-hidden rounded-xl">
          <div className="border-b border-sand-200 px-5 py-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">Ledger</h2>
          </div>
          <ul className="divide-y divide-sand-200">
            {(ledger ?? []).map((row) => {
              const amount = Number(row.amount);
              return (
                <li key={row.id} className="flex items-start justify-between gap-4 px-5 py-4 text-sm">
                  <div>
                    <p className="font-semibold capitalize text-ink-900">
                      {String(row.entry_type).replace(/_/g, " ")}
                    </p>
                    <p className="mt-0.5 text-ink-500">{row.description}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {new Date(row.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${amount < 0 ? "text-signal-bad" : "text-signal-ok"}`}>
                      {amount > 0 ? "+" : ""}
                      {amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-ink-400">bal {Number(row.balance_after).toFixed(2)}</p>
                  </div>
                </li>
              );
            })}
            {(ledger ?? []).length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-ink-500">No ledger entries yet</li>
            ) : null}
          </ul>
        </section>

        <section className="surface overflow-hidden rounded-xl">
          <div className="border-b border-sand-200 px-5 py-4">
            <h2 className="font-display text-xl font-semibold text-ink-900">Invoices</h2>
          </div>
          <ul className="divide-y divide-sand-200">
            {(invoices ?? []).map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                <div>
                  <p className="font-semibold text-ink-900">{inv.invoice_number}</p>
                  <div className="mt-2">
                    <StatusBadge status={inv.status} />
                  </div>
                </div>
                <p className="font-semibold text-ink-800">
                  {inv.currency} {Number(inv.total).toFixed(2)}
                </p>
              </li>
            ))}
            {(invoices ?? []).length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-ink-500">No invoices yet</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
