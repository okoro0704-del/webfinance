import { redirect } from "next/navigation";
import { ClientsList } from "@/components/ClientsList";
import { CreateClientForm } from "@/components/CreateClientForm";
import { Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: distributor }] = await Promise.all([
    supabase.from("profiles").select("role, email").eq("id", user.id).maybeSingle(),
    supabase.from("distributors").select("*").eq("profile_id", user.id).maybeSingle(),
  ]);

  const isAdmin = profile?.role === "platform_admin";
  const isRetailer = distributor?.partner_tier === "software_retailer";
  const deployUnits = distributor?.deploy_units ?? 0;

  if (!distributor && !isAdmin) {
    return (
      <Shell>
        <div className="surface rounded-xl p-6 text-sm text-ink-500">
          Distributor profile required before creating clients.
        </div>
      </Shell>
    );
  }

  const productsQuery = supabase
    .from("products")
    .select("id, sku, name, wholesale_unit_price, client_portal_base_domain")
    .eq("is_active", true);

  const clientsQuery = isAdmin
    ? supabase
        .from("clients")
        .select(
          "*, products!clients_product_id_fkey(id, sku, name), distributors!clients_distributor_id_fkey(company_name, contact_email)",
        )
        .order("created_at", { ascending: false })
    : supabase
        .from("clients")
        .select("*, products!clients_product_id_fkey(id, sku, name)")
        .eq("distributor_id", distributor!.id)
        .order("created_at", { ascending: false });

  const [{ data: products, error: productsErr }, { data: clients, error: clientsErr }] =
    await Promise.all([productsQuery, clientsQuery]);

  const rows = clients ?? [];
  const loadError = productsErr?.message || clientsErr?.message || null;

  return (
    <Shell companyName={distributor?.company_name ?? "Master control"} isAdmin={isAdmin}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Clients</h1>
        <p className="page-copy">
          {isAdmin
            ? "All tenants across partners. Tap a client to open details, deploy, suspend, or delete."
            : isRetailer
              ? "Create tenants with prepaid deploy units. Each Deploy uses one unit — pick any product. When stock runs out, Master sells you more."
              : "Create tenants on slug.webfinance.app. Tap a client to deploy, view login details, or connect a personal domain."}
        </p>
      </header>

      {isRetailer && distributor ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 animate-rise-delayed sm:mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
            Software retailer stock
          </p>
          <p className="mt-1 text-sm text-amber-950">
            {deployUnits === 0
              ? "No deploy units left. Contact Master to buy more before deploying."
              : `${deployUnits} deploy unit${deployUnits === 1 ? "" : "s"} remaining — usable on any product.`}
          </p>
        </div>
      ) : null}

      <div className="mt-6 space-y-6 animate-rise-delayed sm:mt-8 sm:space-y-8">
        {distributor ? (
          <CreateClientForm
            distributorId={distributor.id}
            products={(products ?? []) as Product[]}
            productPortalBases={Object.fromEntries(
              (products ?? []).map((p) => [
                p.id,
                (p.client_portal_base_domain || "webfinance.app") as string,
              ]),
            )}
            isRetailer={isRetailer}
            deployUnits={isRetailer ? deployUnits : undefined}
          />
        ) : (
          <div className="surface rounded-xl p-5 text-sm text-ink-500">
            No distributor workspace linked to this admin login — roster below is read-only.
          </div>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-900 sm:text-2xl">
                Tenant list
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                {rows.length} client{rows.length === 1 ? "" : "s"}
                {isAdmin ? " across all distributors" : ""}
                {" · "}
                tap a row for details
              </p>
            </div>
          </div>

          {loadError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-signal-bad">
              Could not load clients: {loadError}
            </div>
          ) : null}

          <ClientsList
            rows={rows as Parameters<typeof ClientsList>[0]["rows"]}
            isAdmin={isAdmin}
            canManageDomainsFor={distributor?.id ?? null}
            deployDisabledWhenInactive={distributor?.status !== "active" && !isAdmin}
            isRetailer={isRetailer}
            deployUnits={isRetailer ? deployUnits : undefined}
          />
        </section>
      </div>
    </Shell>
  );
}
