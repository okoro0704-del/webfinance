# Project 3 — Master Distributor Control Panel

Supabase-first control panel for a capped distributor tier (≤100) that zero-touch provisions clients onto **Product A (Repo 1)** and **Product B (Repo 2)**.

No traditional app server: Postgres + RLS + Edge Functions own business logic and API orchestration.

## Directory structure

```text
WEbfinance/
├── apps/
│   └── dashboard/                 # Next.js 15 + Tailwind distributor UI
│       ├── src/
│       │   ├── app/               # Routes: /, /login, /signup, /dashboard, /clients, /wallet
│       │   ├── components/        # Shell, DeployButton, CreateClientForm
│       │   └── lib/               # Supabase clients, deploy helper, types
│       ├── package.json
│       └── tailwind.config.ts
├── supabase/
│   ├── config.toml
│   ├── seed.sql                   # Product A / Product B SKUs
│   ├── migrations/
│   │   └── 20260326120000_initial_schema.sql
│   └── functions/
│       ├── _shared/               # cors, supabase, registrar, cloudflare, handshake
│       ├── provision-client/      # Deploy pipeline
│       └── allocate-credits/      # Admin wallet/inventory top-up
├── docs/
│   └── provisioning-pipeline.md
├── .env.example
├── package.json                   # npm workspaces root
└── README.md
```

## Data model (summary)

| Entity | Purpose |
|--------|---------|
| `profiles` | Maps `auth.users` → `platform_admin` / `distributor` |
| `distributors` | Profile, status, cached `wallet_balance` (cap 100 active) |
| `products` | Product A / B SKUs + wholesale price |
| `distributor_inventory` | Prepaid license pools per product (hot path) |
| `clients` | Tenants, domain/SSL state, credentials payload |
| `client_products` | Optional multi-product ownership |
| `invoices` | Wholesale invoices |
| `wallet_ledger` | Append-only source of truth for money movement |
| `provision_jobs` | Idempotent Deploy run log |

**Deploy debit rule:** consume `distributor_inventory.license_credits` first; if zero, debit `wholesale_unit_price` from wallet via `reserve_deploy_license()`.

## Quick start

```bash
# 1) Install
npm install

# 2) Start Supabase locally (Docker required)
npx supabase start
npx supabase db reset   # applies migrations + seed

# 3) Copy keys into env
cp .env.example .env.local
cp apps/dashboard/.env.example apps/dashboard/.env.local
# paste anon/service keys from `npx supabase status`

# 4) Serve Edge Functions (mock integrations on by default)
npm run supabase:functions:serve

# 5) Run dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Activate a distributor (local)

1. Sign up in the UI (creates `profiles` + `distributors` with `status=pending`).
2. In Supabase Studio SQL:

```sql
update public.distributors set status = 'active' where contact_email = 'you@example.com';

select public.allocate_inventory_credits(
  (select id from public.distributors where contact_email = 'you@example.com'),
  (select id from public.products where sku = 'PRODUCT_A'),
  10
);

select public.credit_distributor_wallet(
  (select id from public.distributors where contact_email = 'you@example.com'),
  500
);
```

## Deploy automation (`provision-client`)

1. **License & wallet validation** — `reserve_deploy_license` (row locks, race-safe).
2. **Domain registration** — Namecheap / ResellerClub / `mock` via `REGISTRAR_PROVIDER`.
3. **DNS & SSL** — Cloudflare zone ensure → A/CNAME upsert → Universal SSL or Custom Hostname ACME.
4. **Tenant handshake** — HMAC-signed POST to Repo 1 / Repo 2; credentials returned to dashboard.

See [docs/provisioning-pipeline.md](docs/provisioning-pipeline.md).

## RLS model

- Distributors read/write **only their** clients, jobs, ledger, inventory.
- Platform admins (`profiles.role = platform_admin`) have full access.
- Money/inventory mutations go through `security definer` RPCs invoked by the **service role** inside Edge Functions.

## White-label notes

Dashboard tokens live under Tailwind `brand.*` / CSS variables in `globals.css`. Swap company name in `Shell` and seed copy for reseller-facing builds.
