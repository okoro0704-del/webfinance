export type Product = {
  id: string;
  sku: string;
  name: string;
  wholesale_unit_price: number;
};

export type Distributor = {
  id: string;
  company_name: string;
  contact_email: string;
  status: "pending" | "active" | "suspended";
  wallet_balance: number;
  currency: string;
};

export type InventoryRow = {
  id: string;
  product_id: string;
  license_credits: number;
  licenses_consumed: number;
  products?: Product;
};

export type ClientRow = {
  id: string;
  display_name: string;
  slug: string;
  status: string;
  custom_domain: string | null;
  domain_status: string;
  product_id: string;
  credentials_payload: {
    admin_email?: string;
    temporary_password?: string | null;
    access_url?: string;
  } | null;
  provision_error: string | null;
  products?: Product;
  created_at: string;
};

export type ProvisionJob = {
  id: string;
  status: string;
  current_step: string | null;
  last_error: string | null;
  steps: Array<{
    step: string;
    status: string;
    at: string;
    detail?: unknown;
  }>;
};
