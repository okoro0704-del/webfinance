# Zero-Touch Deploy Pipeline

```mermaid
sequenceDiagram
  participant D as Distributor Dashboard
  participant EF as Edge Fn provision-client
  participant DB as Supabase Postgres
  participant R as Registrar API
  participant CF as Cloudflare API
  participant P as Repo1 / Repo2

  D->>EF: POST Deploy (JWT + idempotency key)
  EF->>DB: Auth + ownership check
  EF->>DB: Upsert provision_jobs (running)
  EF->>DB: RPC reserve_deploy_license
  Note over DB: Prefer inventory credit;<br/>else wallet wholesale debit
  EF->>R: Register custom domain
  EF->>CF: Upsert A/CNAME + SSL/ACME
  EF->>P: HMAC-signed tenant provision
  P-->>EF: tenant_id + credentials
  EF->>DB: clients.status=active + credentials_payload
  EF-->>D: credentials + job steps
```

## Step contract

| Step | Side effects | Failure behavior |
|------|--------------|------------------|
| `wallet_validation` / `license_debit` | Inventory `-1` or wallet ledger debit | Job failed, client `failed`, no external calls |
| `domain_registration` | Registrar order id in `clients.metadata` | Job failed; license already consumed (manual refund/credit) |
| `dns_setup` | Cloudflare zone + record ids on client | Job failed |
| `ssl_init` | Universal SSL or Custom Hostname ACME | Job failed |
| `tenant_handshake` | Repo returns tenant + temp credentials | Job failed |
| `finalize` | `clients.status=active` | Success |

## Idempotency

`x-idempotency-key` (default `deploy:{client_id}`) is unique on `provision_jobs`. Retries reuse the same job row.

## Repo handshake headers

- `X-Distributor-Signature`: HMAC-SHA256 hex of raw JSON body
- `X-Distributor-Timestamp`: epoch ms
- `X-Idempotency-Key`: client UUID

Expected JSON response:

```json
{
  "tenant_id": "ten_123",
  "admin_email": "admin@client.com",
  "temporary_password": "one-time",
  "access_url": "https://client.example.com"
}
```
