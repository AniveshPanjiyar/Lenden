-- Run with `supabase test db` after applying all migrations.
begin;

grant usage on schema public, private to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006');

insert into public.profiles (id, email, full_name, role) values
  ('10000000-0000-4000-8000-000000000001', 'tenant-a@test.invalid', 'Tenant A Owner', 'owner'),
  ('10000000-0000-4000-8000-000000000002', 'tenant-b@test.invalid', 'Tenant B Owner', 'owner'),
  ('10000000-0000-4000-8000-000000000003', 'multi-owner@test.invalid', 'Multi Business Owner', 'owner'),
  ('10000000-0000-4000-8000-000000000004', 'tenant-a-staff@test.invalid', 'Tenant A Staff', 'staff'),
  ('10000000-0000-4000-8000-000000000005', 'new-tenant-a-staff@test.invalid', 'New Tenant A Staff', 'staff'),
  ('10000000-0000-4000-8000-000000000006', 'new-tenant-a-coowner@test.invalid', 'New Tenant A Co-owner', 'owner');

insert into public.businesses (id, name, slug) values
  ('20000000-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a-test'),
  ('20000000-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b-test');

insert into public.business_modules (business_id, module, enabled) values
  ('20000000-0000-4000-8000-000000000001', 'general', true),
  ('20000000-0000-4000-8000-000000000002', 'general', true);

insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'primary_owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'co_owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'co_owner', 'active', now()),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'staff', 'active', now());

insert into public.business_manager_unit_scopes (
  business_id, manager_profile_id, business_type, created_by
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'general', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'general', '10000000-0000-4000-8000-000000000002');

insert into public.business_staff_unit_assignments (
  business_id, staff_profile_id, business_type, manager_profile_id, created_by
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  'general',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.payments (id, business_id, business_type, mode, amount, cash_collection, online_collection, description, collected_by, assigned_profile_id, current_holder_id, approval_status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'general', 'cash', 100, 100, 0, 'Tenant A payment', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'approved'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'general', 'cash', 200, 200, 0, 'Tenant B payment', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'approved');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.headers', '{"x-lenden-business-id":"20000000-0000-4000-8000-000000000001"}', true);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.payments;
  if visible_count <> 1 then
    raise exception 'Expected exactly one visible Tenant A payment, got %', visible_count;
  end if;
  if exists (select 1 from public.payments where business_id = '20000000-0000-4000-8000-000000000002') then
    raise exception 'Tenant A could select a Tenant B payment';
  end if;

  begin
    insert into public.payments (business_id, business_type, mode, amount, cash_collection, online_collection, description, collected_by, assigned_profile_id)
    values ('20000000-0000-4000-8000-000000000002', 'general', 'cash', 10, 10, 0, 'Tampered insert', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
    raise exception 'Cross-tenant payment insert unexpectedly succeeded';
  exception
    when insufficient_privilege or foreign_key_violation then null;
  end;
end;
$$;

select set_config('request.headers', '{"x-lenden-business-id":"20000000-0000-4000-8000-000000000002"}', true);
do $$
begin
  if exists (select 1 from public.payments) then
    raise exception 'Tampered Tenant B header exposed rows to Tenant A';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.headers', '{"x-lenden-business-id":"20000000-0000-4000-8000-000000000001"}', true);
do $$
begin
  if (select count(*) from public.payments) <> 1
    or exists (select 1 from public.payments where business_id <> '20000000-0000-4000-8000-000000000001') then
    raise exception 'Multi-business owner leaked data while Tenant A was selected';
  end if;
end;
$$;
select set_config('request.headers', '{"x-lenden-business-id":"20000000-0000-4000-8000-000000000002"}', true);
do $$
begin
  if (select count(*) from public.payments) <> 1
    or exists (select 1 from public.payments where business_id <> '20000000-0000-4000-8000-000000000002') then
    raise exception 'Multi-business owner leaked data while Tenant B was selected';
  end if;
end;
$$;

-- Membership role matrix: primary owners manage co-owners/staff/agents;
-- co-owners manage staff/agents only; nobody removes the primary owner.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.headers', '{"x-lenden-business-id":"20000000-0000-4000-8000-000000000001"}', true);
do $$
declare
  affected integer;
begin
  insert into public.business_memberships (business_id, profile_id, role, status, invited_by, joined_at)
  values (
    '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005',
    'staff', 'active', '10000000-0000-4000-8000-000000000003', now()
  );

  begin
    insert into public.business_memberships (business_id, profile_id, role, status, invited_by, joined_at)
    values (
      '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006',
      'co_owner', 'active', '10000000-0000-4000-8000-000000000003', now()
    );
    raise exception 'Co-owner unexpectedly created another co-owner membership';
  exception
    when insufficient_privilege then null;
  end;

  update public.business_memberships
  set status = 'suspended', suspended_at = now()
  where business_id = '20000000-0000-4000-8000-000000000001'
    and profile_id = '10000000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Co-owner unexpectedly removed the primary owner';
  end if;

  update public.business_memberships
  set status = 'suspended', suspended_at = now()
  where business_id = '20000000-0000-4000-8000-000000000001'
    and profile_id = '10000000-0000-4000-8000-000000000004';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Co-owner could not remove staff access';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare
  affected integer;
begin
  insert into public.business_memberships (business_id, profile_id, role, status, invited_by, joined_at)
  values (
    '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006',
    'co_owner', 'active', '10000000-0000-4000-8000-000000000001', now()
  );

  update public.business_memberships
  set status = 'suspended', suspended_at = now()
  where business_id = '20000000-0000-4000-8000-000000000001'
    and profile_id = '10000000-0000-4000-8000-000000000003';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Primary owner could not remove co-owner access';
  end if;
end;
$$;

rollback;
