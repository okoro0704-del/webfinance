export type Product = {
  id: string;
  sku: string;
  name: string;
  wholesale_unit_price: number;
  client_portal_base_domain?: string | null;
};

export type Distributor = {
  id: string;
  company_name: string;
  contact_email: string;
  status: "pending" | "active" | "suspended";
  wallet_balance: number;
  currency: string;
  subdomain?: string | null;
  subdomain_slot?: number | null;
  is_master?: boolean;
  partner_tier?: "distributor" | "software_retailer";
  deploy_units?: number;
  deploy_units_consumed?: number;
  custom_domain?: string | null;
  domain_status?: string | null;
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
  portal_hostname?: string | null;
  domain_status: string;
  product_id: string;
  external_tenant_id?: string | null;
  credentials_payload: {
    admin_email?: string;
    temporary_password?: string | null;
    access_url?: string;
    portal_url?: string;
    website?: string;
    brand_name?: string;
    logo_url?: string;
    primary_color?: string;
    client_login_url?: string;
    admin_dashboard_url?: string;
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
