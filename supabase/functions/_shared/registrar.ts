/**
 * Domain registrar adapter (Namecheap / ResellerClub style).
 * Swap implementation via REGISTRAR_PROVIDER env without changing the pipeline.
 */

export type DomainPurchaseResult = {
  orderId: string;
  domain: string;
  status: "registered" | "pending";
  raw?: unknown;
};

export type RegistrarProvider = "namecheap" | "resellerclub" | "mock";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/** Namecheap: XML API — https://www.namecheap.com/support/api/methods/domains/create/ */
async function purchaseNamecheap(domain: string, years = 1): Promise<DomainPurchaseResult> {
  const apiUser = required("NAMECHEAP_API_USER");
  const apiKey = required("NAMECHEAP_API_KEY");
  const clientIp = required("NAMECHEAP_CLIENT_IP");
  const username = Deno.env.get("NAMECHEAP_USERNAME") ?? apiUser;

  const params = new URLSearchParams({
    ApiUser: apiUser,
    ApiKey: apiKey,
    UserName: username,
    ClientIp: clientIp,
    Command: "namecheap.domains.create",
    DomainName: domain,
    Years: String(years),
    // Contact stubs — replace with real WHOIS contact fields in production
    RegistrantFirstName: Deno.env.get("REGISTRANT_FIRST_NAME") ?? "Ops",
    RegistrantLastName: Deno.env.get("REGISTRANT_LAST_NAME") ?? "Team",
    RegistrantAddress1: Deno.env.get("REGISTRANT_ADDRESS") ?? "1 Main St",
    RegistrantCity: Deno.env.get("REGISTRANT_CITY") ?? "Austin",
    RegistrantStateProvince: Deno.env.get("REGISTRANT_STATE") ?? "TX",
    RegistrantPostalCode: Deno.env.get("REGISTRANT_POSTAL") ?? "78701",
    RegistrantCountry: Deno.env.get("REGISTRANT_COUNTRY") ?? "US",
    RegistrantPhone: Deno.env.get("REGISTRANT_PHONE") ?? "+1.5125550100",
    RegistrantEmailAddress: Deno.env.get("REGISTRANT_EMAIL") ?? "domains@example.com",
  });

  const endpoint =
    Deno.env.get("NAMECHEAP_API_BASE") ?? "https://api.namecheap.com/xml.response";
  const res = await fetch(`${endpoint}?${params.toString()}`);
  const text = await res.text();
  if (!res.ok || text.includes('Status="ERROR"')) {
    throw new Error(`Namecheap domain create failed: ${text.slice(0, 500)}`);
  }

  const orderMatch = text.match(/OrderID="([^"]+)"/i);
  return {
    orderId: orderMatch?.[1] ?? `nc-${Date.now()}`,
    domain,
    status: "registered",
    raw: text,
  };
}

/** ResellerClub-style JSON API stub */
async function purchaseResellerClub(domain: string, years = 1): Promise<DomainPurchaseResult> {
  const authUserId = required("RESELLERCLUB_AUTH_USERID");
  const apiKey = required("RESELLERCLUB_API_KEY");
  const base =
    Deno.env.get("RESELLERCLUB_API_BASE") ?? "https://httpapi.com/api";

  const [sld, ...tldParts] = domain.split(".");
  const tld = tldParts.join(".");
  const url = new URL(`${base}/domains/register.json`);
  url.searchParams.set("auth-userid", authUserId);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("domain-name", sld);
  url.searchParams.set("tlds", tld);
  url.searchParams.set("years", String(years));
  url.searchParams.set("ns", Deno.env.get("DEFAULT_NS1") ?? "ns1.cloudflare.com");
  url.searchParams.set("ns", Deno.env.get("DEFAULT_NS2") ?? "ns2.cloudflare.com");
  url.searchParams.set("customer-id", required("RESELLERCLUB_CUSTOMER_ID"));
  url.searchParams.set("reg-contact-id", required("RESELLERCLUB_CONTACT_ID"));
  url.searchParams.set("admin-contact-id", required("RESELLERCLUB_CONTACT_ID"));
  url.searchParams.set("tech-contact-id", required("RESELLERCLUB_CONTACT_ID"));
  url.searchParams.set("billing-contact-id", required("RESELLERCLUB_CONTACT_ID"));
  url.searchParams.set("invoice-option", "NoInvoice");

  const res = await fetch(url.toString(), { method: "POST" });
  const data = await res.json();
  if (!res.ok || data?.status === "ERROR") {
    throw new Error(`ResellerClub register failed: ${JSON.stringify(data)}`);
  }
  return {
    orderId: String(data.entityid ?? data.orderid ?? `rc-${Date.now()}`),
    domain,
    status: data.actionstatus === "Success" ? "registered" : "pending",
    raw: data,
  };
}

async function purchaseMock(domain: string): Promise<DomainPurchaseResult> {
  return {
    orderId: `mock-${crypto.randomUUID()}`,
    domain,
    status: "registered",
  };
}

export async function purchaseDomain(
  domain: string,
  years = 1,
): Promise<DomainPurchaseResult> {
  const provider = (Deno.env.get("REGISTRAR_PROVIDER") ?? "mock") as RegistrarProvider;
  switch (provider) {
    case "namecheap":
      return purchaseNamecheap(domain, years);
    case "resellerclub":
      return purchaseResellerClub(domain, years);
    case "mock":
      return purchaseMock(domain);
    default:
      throw new Error(`Unsupported REGISTRAR_PROVIDER: ${provider}`);
  }
}