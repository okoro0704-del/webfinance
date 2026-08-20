import { redirect } from "next/navigation";
import { CreateDistributorForm } from "./CreateDistributorForm";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: distributor }, { data: partners }] = await Promise.all([
    supabase.from("distributors").select("company_name").eq("profile_id", user.id).maybeSingle(),
    supabase
      .from("distributors")
      .select(
        "id, company_name, contact_email, status, created_at, subdomain, subdomain_slot, is_master",
      )
      .order("is_master", { ascending: false })
      .order("subdomain_slot", { ascending: true }),
  ]);

  return (
    <Shell companyName={distributor?.company_name ?? "Master control"} isAdmin>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Distributors</h1>
        <p className="page-copy">
          Create partner accounts. Each partner gets a free portal like{" "}
          <span className="font-medium text-ink-800">d1.webfinance.app</span>. Domain connect/buy is
          handled by the partner — not here.
        </p>
      </header>

      <div className="mt-8 space-y-8 animate-rise-delayed">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <CreateDistributorForm />

          <section>
            <h2 className="font-display text-xl font-semibold text-ink-900">Partner roster</h2>
            <p className="mt-1 text-sm text-ink-500">Master + distributor workspaces.</p>
            <ul className="surface mt-4 divide-y divide-sand-200 overflow-hidden rounded-xl">
              {(partners ?? []).length === 0 ? (
                <li className="px-5 py-8 text-sm text-ink-500">No distributors yet.</li>
              ) : (
                (partners ?? []).map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink-900">
                        {d.company_name}
                        {d.is_master ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-700">
                            Master
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-ink-500">{d.contact_email}</p>
                      {d.is_master ? (
                        <p className="mt-1 text-xs font-semibold text-brand-700">webfinance.app</p>
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
                      {d.subdomain_slot ? (
                        <p className="mt-1 text-xs text-ink-400">slot {d.subdomain_slot}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={d.status} />
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
