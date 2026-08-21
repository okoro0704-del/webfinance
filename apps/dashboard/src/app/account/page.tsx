import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { PushNotificationSetup } from "@/components/PushNotificationSetup";
import { Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: distributor }] = await Promise.all([
    supabase.from("profiles").select("role, email, full_name").eq("id", user.id).maybeSingle(),
    supabase.from("distributors").select("company_name").eq("profile_id", user.id).maybeSingle(),
  ]);

  const isAdmin = profile?.role === "platform_admin";

  return (
    <Shell companyName={distributor?.company_name ?? "Account"} isAdmin={isAdmin}>
      <header className="animate-rise">
        <div className="section-rule" />
        <h1 className="page-title mt-4">Account</h1>
        <p className="page-copy">
          {profile?.email ?? user.email}
          {profile?.full_name ? ` · ${profile.full_name}` : ""}
        </p>
      </header>

      <div className="mt-8 space-y-6 animate-rise-delayed">
        <PushNotificationSetup />
        <ChangePasswordForm />
      </div>
    </Shell>
  );
}
