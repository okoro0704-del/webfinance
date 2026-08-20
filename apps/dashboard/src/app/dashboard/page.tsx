import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: distributor }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("distributors").select("*").eq("profile_id", user.id).maybeSingle(),
  ]);
  const isAdmin = profile?.role === "platform_admin";
  const isRetailer = distributor?.partner_tier === "software_retailer";

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

  const { count: openRequests } = isAdmin
    ? await supabase
        .from("support_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
    : distributor
      ? await supabase
          .from("support_requests")
          .select("*", { count: "exact", head: true })
          .eq("distributor_id", distributor.id)
          .in("status", ["open", "in_progress"])
      : { count: 0 };

  const { data: inventoryRows } =
    distributor && isRetailer
      ? await supabase
          .from("distributor_inventory")
          .select("product_id, license_credits, products(sku, name)")
          .eq("distributor_id", distributor.id)
      : { data: null };

  const totalUnits = (inventoryRows ?? []).reduce(
    (sum, row) => sum + (row.license_credits ?? 0),
    0,
  );

  return (
    <Shell companyName={distributor?.company_name} isAdmin={isAdmin}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Overview</h1>
        <p className="page-copy">
          {isAdmin
            ? "Create distributors and software retailers, review client tenants, and answer help requests."
            : isRetailer
              ? "Sell prepaid product units to your clients. When stock runs out, ask Master to sell you more."
              : "Create clients, deploy products, manage domains, and request help from Master when needed."}
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
          {isRetailer ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                Product units in stock
              </p>
              <p className="mt-2 font-display text-3xl font-semibold text-amber-950">
                {totalUnits}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-amber-900">
                {(inventoryRows ?? []).length === 0 ? (
                  <li>No inventory rows yet — contact Master after signup.</li>
                ) : (
                  (inventoryRows ?? []).map((row) => {
                    const prod = Array.isArray(row.products) ? row.products[0] : row.products;
                    return (
                      <li key={row.product_id}>
                        {prod?.name ?? "Product"}:{" "}
                        <span className="font-semibold">{row.license_credits ?? 0}</span>
                      </li>
                    );
                  })
                )}
              </ul>
              {totalUnits === 0 ? (
                <p className="mt-3 text-sm text-amber-900">
                  Stock empty. Master sells more units from Partners → your retailer row.
                </p>
              ) : (
                <Link href="/clients" className="btn-primary mt-4 inline-flex">
                  Deploy a client
                </Link>
              )}
            </section>
          ) : null}

          <section className="grid gap-px overflow-hidden rounded-xl border border-sand-200 bg-sand-200 shadow-soft md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white p-6">
              <p className="label">Account</p>
              <p className="mt-3 font-display text-xl font-semibold text-ink-900">
                {distributor.company_name}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={distributor.status} />
                {isRetailer ? (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                    Retailer
                  </span>
                ) : !distributor.is_master ? (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">
                    Distributor
                  </span>
                ) : null}
              </div>
            </div>
            <div className="bg-white p-6">
              <p className="label">Portal</p>
              {distributor.is_master ? (
                <>
                  <p className="mt-3 font-display text-xl font-semibold text-ink-900">
                    webfinance.app
                  </p>
                  <p className="mt-2 text-sm text-ink-500">Master control panel</p>
                </>
              ) : distributor.subdomain ? (
                <>
                  <p className="mt-3 break-all font-display text-lg font-semibold text-ink-900">
                    {distributor.custom_domain || distributor.subdomain}
                  </p>
                  <a
                    className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
                    href={`https://${distributor.custom_domain || distributor.subdomain}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open portal
                  </a>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-500">Pending assignment</p>
              )}
            </div>
            <div className="bg-white p-6">
              <p className="label">Clients</p>
              <p className="metric-value mt-3">{clientCount ?? 0}</p>
              <p className="mt-3 text-sm text-ink-500">{activeCount ?? 0} live</p>
            </div>
            <div className="bg-white p-6">
              <p className="label">{isAdmin ? "Open requests" : isRetailer ? "Stock" : "Next action"}</p>
              {isAdmin ? (
                <>
                  <p className="metric-value mt-3">{openRequests ?? 0}</p>
                  <Link href="/requests" className="btn-primary mt-5">
                    Review requests
                  </Link>
                </>
              ) : isRetailer ? (
                <>
                  <p className="metric-value mt-3">{totalUnits}</p>
                  <p className="mt-2 text-sm text-ink-500">prepaid units left</p>
                  <Link href="/clients" className="btn-primary mt-5">
                    Go to clients
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-3 font-display text-2xl font-semibold text-ink-900">
                    Deploy a client
                  </p>
                  <p className="mt-2 text-sm text-ink-500">Unlimited deployments</p>
                  <Link href="/clients" className="btn-primary mt-5">
                    Go to clients
                  </Link>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </Shell>
  );
}
