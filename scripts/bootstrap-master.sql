insert into public.products (sku, name, description, wholesale_unit_price, metadata)
values
  ('PRODUCT_A', 'Product A', 'Primary SaaS product (Repo 1)', 49.00, '{"repo":"repo1","handshake_path":"/api/v1/tenants/provision"}'::jsonb),
  ('PRODUCT_B', 'Product B', 'Secondary SaaS product (Repo 2)', 79.00, '{"repo":"repo2","handshake_path":"/api/v1/tenants/provision"}'::jsonb)
on conflict (sku) do nothing;

update public.profiles
set role = 'platform_admin',
    full_name = coalesce(nullif(full_name, ''), 'Master Distributor')
where lower(email) = lower('001mrdigital@gmail.com');

insert into public.distributors (profile_id, company_name, contact_email, status, wallet_balance)
select p.id, 'Webfinance Master', p.email, 'active', 1000
from public.profiles p
where lower(p.email) = lower('001mrdigital@gmail.com')
  and not exists (select 1 from public.distributors d where d.profile_id = p.id);

update public.distributors d
set status = 'active',
    company_name = 'Webfinance Master',
    wallet_balance = greatest(wallet_balance, 1000)
from public.profiles p
where d.profile_id = p.id
  and lower(p.email) = lower('001mrdigital@gmail.com');

select p.email, p.role, d.company_name, d.status, d.wallet_balance
from public.profiles p
left join public.distributors d on d.profile_id = p.id
where lower(p.email) = lower('001mrdigital@gmail.com');
