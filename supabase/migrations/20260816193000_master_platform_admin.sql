-- Master distributor / platform admin bootstrap + signup hardening

-- Never trust client-supplied role metadata on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'distributor'
  );
  return new;
end;
$$;

-- Promote the designated master account when it exists
update public.profiles
set role = 'platform_admin'
where lower(email) = lower('001mrdigital@gmail.com');

-- Ensure master has an active distributor workspace (company HQ)
insert into public.distributors (profile_id, company_name, contact_email, status, wallet_balance)
select
  p.id,
  'Webfinance Master',
  p.email,
  'active',
  0
from public.profiles p
where lower(p.email) = lower('001mrdigital@gmail.com')
  and not exists (
    select 1 from public.distributors d where d.profile_id = p.id
  );

update public.distributors d
set status = 'active',
    company_name = coalesce(nullif(d.company_name, ''), 'Webfinance Master')
from public.profiles p
where d.profile_id = p.id
  and lower(p.email) = lower('001mrdigital@gmail.com');
