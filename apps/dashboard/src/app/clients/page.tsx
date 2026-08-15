import { redirect } from "next/navigation";
import { CreateClientForm } from "@/components/CreateClientForm";
import { DeployButton } from "@/components/DeployButton";
import { Shell } from "@/components/Shell";
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
        <div className="panel p-6 text-sm">Distributor profile required.</div>
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

  return (
    <Shell companyName={distributor.company_name}>
      <header className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Clients</h2>
        <p className="text-sm text-ink-500">
          Create a draft tenant, then Deploy to run domain → DNS/SSL → product handshake.
        </p>
      </header>

      <div className="space-y-6">
        <CreateClientForm
          distributorId={distributor.id}
          products={(products ?? []) as Product[]}
        />

        <div className="panel overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {((clients ?? []) as ClientRow[]).map((c) => (
                <tr key={c.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.display_name}</div>
                    <div className="text-xs text-ink-500">{c.slug}</div>
                    {c.credentials_payload?.access_url ? (
                      <a
                        className="text-xs text-brand-600"
                        href={c.credentials_payload.access_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open tenant
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{c.products?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div>{c.custom_domain ?? "—"}</div>
                    <div className="text-xs text-ink-500">{c.domain_status}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-50 px-2 py-1 text-xs">{c.status}</span>
                    {c.provision_error ? (
                      <p className="mt-1 max-w-[200px] text-xs text-red-600">{c.provision_error}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
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
              {(clients ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-500">
                    No clients yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
