import { createClient } from "@/lib/supabase/client";

export type DeployResult = {
  ok?: boolean;
  error?: string;
  client_id?: string;
  credentials?: {
    admin_email: string;
    temporary_password: string | null;
    access_url: string;
  };
  job?: unknown;
};

export async function deployClient(
  clientId: string,
  opts?: { purchaseDomain?: boolean },
): Promise<DeployResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Not authenticated");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/functions/v1/provision-client`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
      "x-idempotency-key": `deploy:${clientId}`,
    },
    body: JSON.stringify({
      client_id: clientId,
      purchase_domain: opts?.purchaseDomain ?? true,
    }),
  });

  const data = (await res.json()) as DeployResult;
  if (!res.ok) {
    throw new Error(data.error ?? "Deploy failed");
  }
  return data;
}
