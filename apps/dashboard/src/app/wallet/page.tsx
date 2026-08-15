import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
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
        <div className="panel p-6 text-sm">Distributor profile required.</div>
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
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Wallet & invoices</h2>
        <p className="text-sm text-ink-500">
          Ledger is append-only; balance cache on distributor is updated by RPCs.
        </p>
      </header>

      <div className="mb-6 panel p-5">
        <p className="label">Current balance</p>
        <p className="mt-2 text-3xl font-semibold">
          {distributor.currency} {Number(distributor.wallet_balance).toFixed(2)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">Ledger</div>
          <ul className="divide-y divide-[var(--line)]">
            {(ledger ?? []).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{row.entry_type}</p>
                  <p className="text-xs text-ink-500">{row.description}</p>
                  <p className="text-xs text-ink-500">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className={Number(row.amount) < 0 ? "text-red-600" : "text-brand-700"}>
                    {Number(row.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-ink-500">bal {Number(row.balance_after).toFixed(2)}</p>
                </div>
              </li>
            ))}
            {(ledger ?? []).length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink-500">No ledger entries</li>
            ) : null}
          </ul>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3 font-medium">Invoices</div>
          <ul className="divide-y divide-[var(--line)]">
            {(invoices ?? []).map((inv) => (
              <li key={inv.id} className="flex justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{inv.invoice_number}</p>
                  <p className="text-xs text-ink-500">{inv.status}</p>
                </div>
                <p className="font-medium">
                  {inv.currency} {Number(inv.total).toFixed(2)}
                </p>
              </li>
            ))}
            {(invoices ?? []).length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink-500">No invoices yet</li>
            ) : null}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
