/** Shared customer-app templates for Money Movement + Parcel Movement. */

export type ProductKind = "mm" | "pm";

export type MmFeatureKey =
  | "transfers"
  | "internal_transfer_only"
  | "cards"
  | "statements"
  | "multi_account"
  | "transfer_approvals"
  | "goals"
  | "concierge_support";

export type PmFeatureKey =
  | "create_shipment"
  | "tracking"
  | "mailbox"
  | "bulk_ship"
  | "labels"
  | "map_stops"
  | "pod_upload"
  | "exports"
  | "multi_location";

export type ProductTemplate = {
  id: string;
  label: string;
  summary: string;
  style: string;
  features: Record<string, boolean>;
};

export const MM_TEMPLATES: ProductTemplate[] = [
  {
    id: "retail_classic",
    label: "Retail Classic",
    summary: "Balance hero, transfers, history, profile — default personal banking.",
    style: "classic",
    features: {
      transfers: true,
      internal_transfer_only: false,
      cards: false,
      statements: true,
      multi_account: false,
      transfer_approvals: false,
      goals: false,
      concierge_support: false,
    },
  },
  {
    id: "cards_first",
    label: "Cards First",
    summary: "Card-forward home; pay/top-up first, transfer secondary.",
    style: "cards",
    features: {
      transfers: true,
      internal_transfer_only: false,
      cards: true,
      statements: true,
      multi_account: false,
      transfer_approvals: false,
      goals: false,
      concierge_support: false,
    },
  },
  {
    id: "savings_focus",
    label: "Savings Focus",
    summary: "Goals & deposits; peer transfer off or own-accounts only.",
    style: "compact",
    features: {
      transfers: true,
      internal_transfer_only: true,
      cards: false,
      statements: true,
      multi_account: false,
      transfer_approvals: false,
      goals: true,
      concierge_support: false,
    },
  },
  {
    id: "business_lite",
    label: "Business Lite",
    summary: "Multi-account, approvals, statements — denser SME banking.",
    style: "business",
    features: {
      transfers: true,
      internal_transfer_only: false,
      cards: false,
      statements: true,
      multi_account: true,
      transfer_approvals: true,
      goals: false,
      concierge_support: false,
    },
  },
  {
    id: "private_concierge",
    label: "Private Concierge",
    summary: "Minimal premium UI with banker support CTA.",
    style: "concierge",
    features: {
      transfers: false,
      internal_transfer_only: false,
      cards: false,
      statements: true,
      multi_account: false,
      transfer_approvals: false,
      goals: false,
      concierge_support: true,
    },
  },
];

export const PM_TEMPLATES: ProductTemplate[] = [
  {
    id: "shipper_classic",
    label: "Shipper Classic",
    summary: "Create shipments, track, mailbox — default logistics portal.",
    style: "classic",
    features: {
      create_shipment: true,
      tracking: true,
      mailbox: true,
      bulk_ship: false,
      labels: false,
      map_stops: false,
      pod_upload: false,
      exports: false,
      multi_location: false,
    },
  },
  {
    id: "tracker_only",
    label: "Tracker Only",
    summary: "Track-by-number focus; no create shipment.",
    style: "tracker",
    features: {
      create_shipment: false,
      tracking: true,
      mailbox: false,
      bulk_ship: false,
      labels: false,
      map_stops: false,
      pod_upload: false,
      exports: false,
      multi_location: false,
    },
  },
  {
    id: "marketplace_seller",
    label: "Marketplace Seller",
    summary: "Bulk ship, labels, status board, mailbox.",
    style: "seller",
    features: {
      create_shipment: true,
      tracking: true,
      mailbox: true,
      bulk_ship: true,
      labels: true,
      map_stops: false,
      pod_upload: false,
      exports: false,
      multi_location: false,
    },
  },
  {
    id: "fleet_field",
    label: "Fleet / Field",
    summary: "Map stops, status updates, proof of delivery.",
    style: "fleet",
    features: {
      create_shipment: false,
      tracking: true,
      mailbox: false,
      bulk_ship: false,
      labels: false,
      map_stops: true,
      pod_upload: true,
      exports: false,
      multi_location: false,
    },
  },
  {
    id: "enterprise_ops",
    label: "Enterprise Ops",
    summary: "Dense tables, filters, CSV export, multi-location.",
    style: "enterprise",
    features: {
      create_shipment: true,
      tracking: true,
      mailbox: true,
      bulk_ship: true,
      labels: true,
      map_stops: false,
      pod_upload: false,
      exports: true,
      multi_location: true,
    },
  },
];

export function productKindFromSku(sku: string | null | undefined): ProductKind | null {
  const s = String(sku ?? "").toUpperCase();
  if (!s) return null;
  if (s.includes("PRODUCT_B") || s === "PM" || s.includes("PARCEL") || s.includes("DELIVERY")) {
    return "pm";
  }
  if (s.includes("PRODUCT_A") || s === "MM" || s.includes("MONEY") || s.includes("BANK")) {
    return "mm";
  }
  // Heuristic fallbacks used in this monorepo
  if (s.includes("B")) return "pm";
  if (s.includes("A")) return "mm";
  return "mm";
}

export function templatesForKind(kind: ProductKind): ProductTemplate[] {
  return kind === "pm" ? PM_TEMPLATES : MM_TEMPLATES;
}

export function defaultTemplateId(kind: ProductKind): string {
  return kind === "pm" ? "shipper_classic" : "retail_classic";
}

export function resolveTemplate(
  kind: ProductKind,
  templateId: string | null | undefined,
): ProductTemplate {
  const list = templatesForKind(kind);
  const id = templateId || defaultTemplateId(kind);
  return list.find((t) => t.id === id) ?? list[0]!;
}
