import { redirect } from "next/navigation";
import { CreateClientForm } from "@/components/CreateClientForm";
import { DeployButton } from "@/components/DeployButton";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, Product } from "@/lib/types";

export default async function ClientsPage() {
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
          Distributor profile required before creating clients.
        </div>
      </Shell>
    );
  }

  const [{ data: products }, { data: clients }] = await Promise.all([
    supabase.from("products").select("id, sku, name, wholesale_unit_price").eq("is_active", true),
    supabase
      .from("clients")
      .select("*, products(id, sku, name, wholesale_unit_price)")
      .eq("distributor_id", distributor.id)
      .order("created_at", { ascending: false }),
  ]);

  const rows = (clients ?? []) as ClientRow[];

  return (
    <Shell companyName={distributor.company_name}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Clients</h1>
        <p className="page-copy">
          Draft a tenant, then Deploy to run domain registration, Cloudflare DNS/SSL, and product handshake.
        </p>
      </header>

      <div className="mt-8 space-y-8 animate-rise-delayed">
        <CreateClientForm
          distributorId={distributor.id}
          products={(products ?? []) as Product[]}
        />

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink-900">Tenant list</h2>
              <p className="mt-1 text-sm text-ink-500">{rows.length} client{rows.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="surface overflow-hidden rounded-xl shadow-soft">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-50 text-[11px] uppercase tracking-[0.12em] text-ink-500">
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Domain</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-sand-200 last:border-0 hover:bg-sand-50/70">
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-ink-900">{c.display_name}</p>
                        <p className="text-xs text-ink-500">{c.slug}</p>
                        {c.credentials_payload?.access_url ? (
                          <a
                            className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:text-brand-800"
                            href={c.credentials_payload.access_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open tenant
                          </a>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 align-top text-ink-700">
                        {c.products?.name ?? "—"}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-ink-800">{c.custom_domain ?? "—"}</p>
                        <p className="text-xs text-ink-500">{c.domain_status}</p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <StatusBadge status={c.status} />
                        {c.provision_error ? (
                          <p className="mt-2 max-w-[220px] text-xs text-signal-bad">
                            {c.provision_error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 align-top text-right">
                        <DeployButton
                          clientId={c.id}
                          disabled={
                            distributor.status !== "active" ||
                            c.status === "active" ||
                            c.status === "provisioning"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-ink-500">
                        No clients yet. Create a draft above to get started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
