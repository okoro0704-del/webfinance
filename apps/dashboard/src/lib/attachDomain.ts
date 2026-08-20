import { createClient } from "@/lib/supabase/client";

export type DnsInstruction = {
  type: string;
  name: string;
  value: string;
  purpose?: string;
};

export type AttachDomainResult = {
  ok?: boolean;
  error?: string;
  domain?: string;
  domain_status?: string;
  live?: boolean;
  mode?: string;
  ssl_status?: string | null;
  cf_status?: string;
  instructions?: DnsInstruction[];
  message?: string;
};

export async function callAttachDomain(input: {
  scope: "client" | "distributor";
  entityId: string;
  domain?: string;
  action?: "attach" | "verify" | "detach";
}): Promise<AttachDomainResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/functions/v1/attach-domain`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scope: input.scope,
      entity_id: input.entityId,
      domain: input.domain,
      action: input.action ?? "attach",
    }),
  });

  const data = (await res.json()) as AttachDomainResult;
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? "Domain request failed");
  }
  return data;
}
