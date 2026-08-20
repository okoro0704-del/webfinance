import { createClient } from "@/lib/supabase/client";

export type CreateDistributorInput = {
  email: string;
  password: string;
  company_name: string;
  full_name?: string;
  status?: "pending" | "active";
  partner_tier?: "distributor" | "software_retailer";
  wallet_amount?: number;
  product_a_credits?: number;
  product_b_credits?: number;
};

export type CreateDistributorResult = {
  ok?: boolean;
  error?: string;
  distributor_id?: string;
  email?: string;
  status?: string;
  partner_tier?: string;
  wallet_balance?: number;
  subdomain?: string;
  subdomain_slot?: number;
  starter_units?: { PRODUCT_A?: number; PRODUCT_B?: number };
};

export async function createDistributor(
  input: CreateDistributorInput,
): Promise<CreateDistributorResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "").replace(
    /\/(rest|auth|storage|functions)\/v1$/i,
    "",
  );
  const res = await fetch(`${base}/functions/v1/create-distributor`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = (await res.json()) as CreateDistributorResult;
  if (!res.ok) throw new Error(data.error ?? "Failed to create distributor");
  return data;
}
