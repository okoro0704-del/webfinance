"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PartnerBrand = {
  company_name: string;
  partner_tier: "distributor" | "software_retailer";
  subdomain: string | null;
};

/** True on Master apex hosts — always keep WebFinance branding. */
export function isMasterHost(hostname?: string | null) {
  const host = (hostname ?? "").toLowerCase().split(":")[0];
  return (
    host === "webfinance.app" ||
    host === "www.webfinance.app" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".netlify.app")
  );
}

export function usePartnerBrandFromHost() {
  const [brand, setBrand] = useState<PartnerBrand | null>(null);

  useEffect(() => {
    const host = window.location.hostname.toLowerCase();
    // Master / local / Netlify preview → WebFinance brand only
    if (isMasterHost(host)) return;

    const supabase = createClient();
    void supabase
      .rpc("public_partner_brand_by_host", { p_host: host })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.company_name) {
          setBrand({
            company_name: String(row.company_name),
            partner_tier:
              row.partner_tier === "software_retailer"
                ? "software_retailer"
                : "distributor",
            subdomain: row.subdomain ? String(row.subdomain) : null,
          });
          document.title = `${row.company_name} · Powered by WebFinance`;
        }
      });
  }, []);

  return brand;
}
