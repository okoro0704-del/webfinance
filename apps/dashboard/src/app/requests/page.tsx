import { redirect } from "next/navigation";
import { CreateRequestForm } from "@/components/CreateRequestForm";
import { MasterRequestActions } from "@/components/MasterRequestActions";
import { Shell } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
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

  if (!distributor && !isAdmin) {
    return (
      <Shell>
        <div className="surface rounded-xl p-6 text-sm text-ink-500">
          Distributor profile required.
        </div>
      </Shell>
    );
  }

  const requestsQuery = isAdmin
    ? supabase
        .from("support_requests")
        .select(
          "id, subject, body, status, master_notes, created_at, resolved_at, client_id, distributor_id, distributors(company_name, contact_email), clients(display_name, slug)",
        )
        .order("created_at", { ascending: false })
        .limit(100)
    : supabase
        .from("support_requests")
        .select(
          "id, subject, body, status, master_notes, created_at, resolved_at, client_id, clients(display_name, slug)",
        )
        .eq("distributor_id", distributor!.id)
        .order("created_at", { ascending: false })
        .limit(50);

  const [{ data: requests }, { data: clients }] = await Promise.all([
    requestsQuery,
    !isAdmin && distributor
      ? supabase
          .from("clients")
          .select("id, display_name")
          .eq("distributor_id", distributor.id)
          .order("display_name")
      : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
  ]);

  return (
    <Shell companyName={distributor?.company_name} isAdmin={isAdmin}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">{isAdmin ? "Partner requests" : "Requests"}</h1>
        <p className="page-copy">
          {isAdmin
            ? "Inbox of fix / help requests from distributors about their clients or portals."
            : "Send Master a request when something needs fixing — Deploy, domains, access, etc."}
        </p>
      </header>

      <div className="mt-8 space-y-8 animate-rise-delayed">
        {!isAdmin && distributor && !distributor.is_master ? (
          <CreateRequestForm
            distributorId={distributor.id}
            clients={(clients ?? []).map((c) => ({
              id: c.id,
              display_name: c.display_name,
            }))}
          />
        ) : null}

        <section>
          <h2 className="font-display text-xl font-semibold text-ink-900">
            {isAdmin ? "Inbox" : "Your requests"}
          </h2>
          <ul className="mt-4 space-y-3">
            {(requests ?? []).length === 0 ? (
              <li className="surface rounded-xl px-5 py-8 text-sm text-ink-500">
                No requests yet.
              </li>
            ) : (
              (requests ?? []).map((r) => {
                const dist = (r as { distributors?: { company_name?: string; contact_email?: string } })
                  .distributors;
                const client = (r as { clients?: { display_name?: string; slug?: string } }).clients;
                return (
                  <li key={r.id} className="surface rounded-xl p-4 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink-900">{r.subject}</p>
                        {isAdmin && dist ? (
                          <p className="mt-1 text-xs text-ink-500">
                            {dist.company_name} · {dist.contact_email}
                          </p>
                        ) : null}
                        {client?.display_name ? (
                          <p className="mt-1 text-xs text-ink-500">
                            Client: {client.display_name}
                            {client.slug ? ` (${client.slug})` : ""}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{r.body}</p>
                    {r.master_notes ? (
                      <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                        Master: {r.master_notes}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-ink-400">
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {isAdmin ? (
                      <MasterRequestActions requestId={r.id} status={r.status} />
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
