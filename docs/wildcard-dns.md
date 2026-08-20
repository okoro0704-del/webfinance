# Hostnames

## Control panel
- Master: `webfinance.app`
- Partners: `d1.webfinance.app` … `d100.webfinance.app`

## Tenants (Money Movement & Parcel Movement)
- Pattern: `{slug}.webfinance.app` (same for both products)
- Example: `miamisecurity.webfinance.app`

## Netlify DNS

Zone is on Netlify (NS1).

**Partner portals** → control panel site `webfinance-distributor-cp.netlify.app`:
1. CNAME `dN` → `webfinance-distributor-cp.netlify.app`
2. Domain alias `dN.webfinance.app` on that site

**Tenant portals** → product app site (by SKU):
- Money Movement → same target as `mm.webfinance.app`
- Parcel Movement → same target as `pm.webfinance.app`
1. CNAME `{slug}` → product Netlify hostname
2. Domain alias `{slug}.webfinance.app` on that product site
