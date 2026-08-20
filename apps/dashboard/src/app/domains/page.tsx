import { redirect } from "next/navigation";
import { DomainSelfServePanel } from "@/components/DomainSelfServePanel";
import { Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
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

  // Master has no domain management surface
  if (isAdmin || distributor?.is_master) {
    redirect("/dashboard");
  }

  if (!distributor) {
    return (
      <Shell isAdmin={isAdmin}>
        <div className="surface rounded-xl p-6 text-sm text-ink-500">
          Distributor profile required to manage domains.
        </div>
      </Shell>
    );
  }

  return (
    <Shell companyName={distributor.company_name} isAdmin={isAdmin}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Domains</h1>
        <p className="page-copy">
          Your free Webfinance address works immediately. To use a personal domain (like{" "}
          <span className="font-medium text-ink-700">yourbrand.com</span>), buy it yourself, connect
          it here, and add one DNS record. We handle the secure certificate after that.
        </p>
      </header>

      <div className="mt-6 max-w-2xl animate-rise-delayed sm:mt-8">
        <DomainSelfServePanel
          title="Your partner portal domain"
          subtitle="This domain is for your distributor brand. For each client’s own domain, open that client in Clients and expand the details."
          freeHostname={distributor.subdomain}
          currentDomain={distributor.custom_domain}
          domainStatus={distributor.domain_status}
          scope="distributor"
          entityId={distributor.id}
        />
      </div>
    </Shell>
  );
}
