-- Run with `supabase test db` after applying all migrations.
begin;

grant usage on schema public, private to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('81000000-0000-4000-8000-000000000001', 'access-owner@test.invalid', now(), '{"full_name":"Access Owner"}'),
  ('81000000-0000-4000-8000-000000000002', 'access-manager@test.invalid', now(), '{"full_name":"Access Manager"}'),
  ('81000000-0000-4000-8000-000000000003', 'invited-user@test.invalid', now(), '{"full_name":"Invited User"}'),
  ('81000000-0000-4000-8000-000000000004', 'granted-user@test.invalid', now(), '{"full_name":"Granted User"}'),
  ('81000000-0000-4000-8000-000000000005', 'platform-admin@test.invalid', now(), '{"full_name":"Platform Admin"}'),
  ('81000000-0000-4000-8000-000000000006', 'requester@test.invalid', now(), '{"full_name":"Business Requester"}');

do $$
begin
  if (select count(*) from public.profiles where id between '81000000-0000-4000-8000-000000000001' and '81000000-0000-4000-8000-000000000006') <> 6 then
    raise exception 'Auth trigger did not create all global profiles';
  end if;
  if exists (select 1 from public.profiles where id = '81000000-0000-4000-8000-000000000003' and must_change_password) then
    raise exception 'Self-created identities must not receive a forced temporary password';
  end if;
end;
$$;

update public.profiles set platform_role = 'platform_admin' where id = '81000000-0000-4000-8000-000000000005';

insert into public.businesses (id, name, slug, created_by) values
  ('82000000-0000-4000-8000-000000000001', 'Access Test', 'access-test', '81000000-0000-4000-8000-000000000005');
insert into public.business_modules (business_id, module, enabled) values
  ('82000000-0000-4000-8000-000000000001', 'general', true);
insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'co_owner', 'active', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select set_config('request.headers', '{"x-lenden-business-id":"82000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  begin
    perform public.grant_business_access(
      '82000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      'co_owner',
      '{}'
    );
    raise exception 'Manager unexpectedly granted Manager access';
  exception when insufficient_privilege then null;
  end;
end;
$$;

do $$
begin
  begin
    perform public.grant_business_access(
      '82000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000002',
      'staff',
      '{}'
    );
    raise exception 'Manager unexpectedly changed an existing Manager';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select public.grant_business_access(
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000004',
  'staff',
  array['collect_general', 'transfer_money']
);

do $$
begin
  if not exists (
    select 1 from public.business_memberships
    where business_id = '82000000-0000-4000-8000-000000000001'
      and profile_id = '81000000-0000-4000-8000-000000000004'
      and role = 'staff' and status = 'active'
  ) then raise exception 'Owner grant did not create active staff membership'; end if;
  if not exists (
    select 1
    from public.business_member_permissions bmp
    join public.business_memberships bm on bm.id = bmp.membership_id
    where bm.business_id = '82000000-0000-4000-8000-000000000001'
      and bm.profile_id = '81000000-0000-4000-8000-000000000004'
      and bmp.permission = 'transfer_money'
  ) then raise exception 'Owner grant did not preserve transaction-transfer permission'; end if;
end;
$$;

reset role;
insert into public.business_invitations (
  id, business_id, email, intended_role, permissions, token_hash, invited_by, expires_at, delivery_status
) values (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'invited-user@test.invalid',
  'staff',
  array['collect_general', 'transfer_money'],
  repeat('a', 64),
  '81000000-0000-4000-8000-000000000001',
  now() + interval '30 days',
  'sent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);

do $$
begin
  begin
    perform public.accept_business_invitation('83000000-0000-4000-8000-000000000001');
    raise exception 'Wrong-email user unexpectedly accepted invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000003', true);
select public.accept_business_invitation('83000000-0000-4000-8000-000000000001');

do $$
begin
  if not exists (
    select 1 from public.business_memberships
    where business_id = '82000000-0000-4000-8000-000000000001'
      and profile_id = '81000000-0000-4000-8000-000000000003'
      and status = 'active'
  ) then raise exception 'Accepted invitation did not create membership'; end if;
  if not exists (select 1 from public.business_invitations where id = '83000000-0000-4000-8000-000000000001' and status = 'accepted') then
    raise exception 'Accepted invitation did not transition state';
  end if;
  if not exists (
    select 1
    from public.business_member_permissions bmp
    join public.business_memberships bm on bm.id = bmp.membership_id
    where bm.business_id = '82000000-0000-4000-8000-000000000001'
      and bm.profile_id = '81000000-0000-4000-8000-000000000003'
      and bmp.permission = 'transfer_money'
  ) then raise exception 'Accepted invitation did not preserve transaction-transfer permission'; end if;
end;
$$;

reset role;
insert into public.business_invitations (
  id, business_id, email, intended_role, permissions, token_hash, invited_by, expires_at, delivery_status
) values (
  '83000000-0000-4000-8000-000000000002',
  '82000000-0000-4000-8000-000000000001',
  'granted-user@test.invalid',
  'staff',
  '{}',
  repeat('b', 64),
  '81000000-0000-4000-8000-000000000001',
  now() + interval '30 days',
  'sent'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select public.decline_business_invitation('83000000-0000-4000-8000-000000000002');

do $$
begin
  begin
    perform public.accept_business_invitation('83000000-0000-4000-8000-000000000002');
    raise exception 'Declined invitation unexpectedly granted access';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000006', true);
insert into public.business_creation_requests (id, requested_by, requested_name, requested_modules, note)
values (
  '84000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000006',
  'Requested Business',
  array['library'::public.payment_business, 'general'::public.payment_business],
  'Please review'
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000005', true);
select public.approve_business_creation_request(
  '84000000-0000-4000-8000-000000000001',
  'Requested Business',
  'requested-business-test',
  'Asia/Kolkata',
  'INR',
  array['library'::public.payment_business, 'general'::public.payment_business]
);

do $$
begin
  if not exists (
    select 1 from public.business_creation_requests r
    join public.business_memberships bm on bm.business_id = r.created_business_id
    where r.id = '84000000-0000-4000-8000-000000000001'
      and r.status = 'approved'
      and bm.profile_id = r.requested_by
      and bm.role = 'primary_owner'
      and bm.status = 'active'
  ) then raise exception 'Request approval did not atomically create primary ownership'; end if;
end;
$$;

select public.create_business_with_owner(
  'Admin Created Business',
  'admin-created-business-test',
  'Asia/Kolkata',
  'INR',
  array['library'::public.payment_business, 'general'::public.payment_business],
  'granted-user@test.invalid'
);

do $$
begin
  if not exists (
    select 1
    from public.businesses b
    join public.business_memberships bm on bm.business_id = b.id
    join public.audit_events ae on ae.business_id = b.id
    where b.slug = 'admin-created-business-test'
      and bm.profile_id = '81000000-0000-4000-8000-000000000004'
      and bm.role = 'primary_owner'
      and bm.status = 'active'
      and ae.event_type = 'business_created'
  ) then
    raise exception 'Admin creation did not atomically create ownership and audit history';
  end if;
  if (
    select count(*)
    from public.business_modules modules
    join public.businesses b on b.id = modules.business_id
    where b.slug = 'admin-created-business-test'
      and modules.enabled
  ) <> 2 then
    raise exception 'Admin creation did not enable the selected modules';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000006', true);
do $$
begin
  begin
    perform public.create_business_with_owner(
      'Unauthorized Business',
      'unauthorized-business-test',
      'Asia/Kolkata',
      'INR',
      array['general'::public.payment_business],
      'requester@test.invalid'
    );
    raise exception 'A non-platform administrator unexpectedly created a business';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
