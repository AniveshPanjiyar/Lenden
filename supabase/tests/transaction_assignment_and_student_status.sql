-- Run with `supabase test db` after applying all migrations.
begin;

grant usage on schema public, private to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

insert into auth.users (id) values
  ('71000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000002'),
  ('71000000-0000-4000-8000-000000000003'),
  ('71000000-0000-4000-8000-000000000004'),
  ('71000000-0000-4000-8000-000000000005'),
  ('71000000-0000-4000-8000-000000000006');

insert into public.profiles (id, email, full_name, role) values
  ('71000000-0000-4000-8000-000000000001', 'assignment-owner@test.invalid', 'Assignment Owner', 'owner'),
  ('71000000-0000-4000-8000-000000000002', 'assignment-staff1@test.invalid', 'Staff 1', 'staff'),
  ('71000000-0000-4000-8000-000000000003', 'assignment-staff2@test.invalid', 'Staff 2', 'staff'),
  ('71000000-0000-4000-8000-000000000004', 'assignment-staff3@test.invalid', 'Staff 3', 'staff'),
  ('71000000-0000-4000-8000-000000000005', 'assignment-no-permission@test.invalid', 'No Permission', 'staff'),
  ('71000000-0000-4000-8000-000000000006', 'assignment-manager@test.invalid', 'Assignment Manager', 'owner');

insert into public.businesses (id, name, slug) values
  ('72000000-0000-4000-8000-000000000001', 'Assignment Test', 'assignment-test');

insert into public.business_modules (business_id, module, enabled) values
  ('72000000-0000-4000-8000-000000000001', 'general', true),
  ('72000000-0000-4000-8000-000000000001', 'library', true),
  ('72000000-0000-4000-8000-000000000001', 'course', true);

insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000005', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000006', 'co_owner', 'active', now());

insert into public.business_member_permissions (membership_id, permission)
select id, permission
from public.business_memberships
cross join lateral unnest(array['collect_general', 'collect_library', 'collect_course']) as permissions(permission)
where business_id = '72000000-0000-4000-8000-000000000001'
  and profile_id in (
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000004'
  );

insert into public.payments (
  id, business_id, business_type, mode, amount, cash_collection, online_collection,
  description, collected_by, assigned_profile_id, current_holder_id, approval_status,
  cash_approval_status, online_approval_status
) values
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'general', 'mixed', 100, 40, 60,
    'Mixed assignment test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'approved', 'approved', 'approved'),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'general', 'online', 75, 0, 75,
    'Online assignment test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', null, 'approved', null, 'approved'),
  ('73000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'general', 'cash', 25, 25, 0,
    'Rejected assignment test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'pending', 'pending', null),
  ('73000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001', 'general', 'cash', 30, 30, 0,
    'Permission assignment test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'pending', 'pending', null),
  ('73000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000001', 'general', 'cash', 35, 35, 0,
    'Transfer permission request test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'pending', 'pending', null),
  ('73000000-0000-4000-8000-000000000006', '72000000-0000-4000-8000-000000000001', 'general', 'cash', 45, 45, 0,
    'Approved Owner-only transfer test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'approved', 'approved', null);

insert into public.money_movements (
  id, business_id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by
) values
  ('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'transfer', 'mixed', 100,
    '73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002'),
  ('74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'transfer', 'online', 75,
    '73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002'),
  ('74000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'transfer', 'cash', 25,
    '73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002'),
  ('74000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001', 'transfer', 'cash', 30,
    '73000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000002');

do $$
begin
  begin
    insert into public.money_movements (
      business_id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by
    ) values (
      '72000000-0000-4000-8000-000000000001', 'transfer', 'cash', 25,
      '73000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000002'
    );
    raise exception 'Duplicate pending transfer unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select set_config('request.headers', '{"x-lenden-business-id":"72000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  begin
    insert into public.money_movements (
      id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by, client_request_id
    ) values (
      '74000000-0000-4000-8000-000000000006', 'transfer', 'cash', 35,
      '73000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002',
      'transfer-permission-denied'
    );
    raise exception 'Staff without transfer permission unexpectedly requested a transaction transfer';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
insert into public.business_member_permissions (membership_id, permission)
select id, 'transfer_money'
from public.business_memberships
where business_id = '72000000-0000-4000-8000-000000000001'
  and profile_id = '71000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select set_config('request.headers', '{"x-lenden-business-id":"72000000-0000-4000-8000-000000000001"}', true);
insert into public.money_movements (
  id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by, client_request_id
) values (
  '74000000-0000-4000-8000-000000000006', 'transfer', 'cash', 35,
  '73000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002',
  'transfer-permission-allowed'
);

do $$
begin
  begin
    insert into public.money_movements (
      id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by, client_request_id
    ) values (
      '74000000-0000-4000-8000-000000000007', 'transfer', 'cash', 45,
      '73000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000002',
      'approved-transfer-staff-denied'
    );
    raise exception 'Staff unexpectedly requested an approved transaction transfer';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000006', true);
do $$
begin
  begin
    insert into public.money_movements (
      id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by, client_request_id
    ) values (
      '74000000-0000-4000-8000-000000000008', 'transfer', 'cash', 45,
      '73000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000006',
      'approved-transfer-manager-denied'
    );
    raise exception 'Manager unexpectedly requested an approved transaction transfer';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
insert into public.money_movements (
  id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by, client_request_id
) values (
  '74000000-0000-4000-8000-000000000007', 'transfer', 'cash', 45,
  '73000000-0000-4000-8000-000000000006', '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000001',
  'approved-transfer-owner-allowed'
);

-- Re-run the migration's backfill query against test fixtures and prove that
-- collecting Staff receive the explicit transfer toggle.
reset role;
insert into public.business_member_permissions (membership_id, permission, granted_by)
select
  collecting_membership.id,
  'transfer_money',
  owner_membership.profile_id
from public.business_memberships collecting_membership
join lateral (
  select bm.profile_id
  from public.business_memberships bm
  where bm.business_id = collecting_membership.business_id
    and bm.role = 'primary_owner'
  order by (bm.status = 'active') desc, bm.joined_at nulls last
  limit 1
) owner_membership on true
where collecting_membership.role = 'staff'
  and exists (
    select 1
    from public.business_member_permissions existing_permission
    where existing_permission.membership_id = collecting_membership.id
      and existing_permission.permission in (
        'collect_guest_house',
        'collect_library',
        'collect_course',
        'collect_general'
      )
  )
on conflict (membership_id, permission) do nothing;

do $$
begin
  if (
    select count(*)
    from public.business_memberships membership
    join public.business_member_permissions permission
      on permission.membership_id = membership.id
     and permission.permission = 'transfer_money'
    where membership.business_id = '72000000-0000-4000-8000-000000000001'
      and membership.profile_id in (
        '71000000-0000-4000-8000-000000000002',
        '71000000-0000-4000-8000-000000000003',
        '71000000-0000-4000-8000-000000000004'
      )
  ) <> 3 then
    raise exception 'Transfer permission backfill missed collecting Staff';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
select set_config('request.headers', '{"x-lenden-business-id":"72000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  if (select assigned_profile_id from public.payments where id = '73000000-0000-4000-8000-000000000001')
      <> '71000000-0000-4000-8000-000000000002' then
    raise exception 'Pending transfer changed assignment';
  end if;
end $$;

select public.lenden_respond_payment_transfer(
  '74000000-0000-4000-8000-000000000001', 'accepted', current_date
);

do $$
begin
  begin
    perform public.lenden_respond_payment_transfer(
      '74000000-0000-4000-8000-000000000001', 'rejected', current_date
    );
    raise exception 'Opposite repeated response unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'Opposite repeated response unexpectedly succeeded' then raise; end if;
  end;
end $$;

do $$
begin
  if not exists (
    select 1 from public.payments
    where id = '73000000-0000-4000-8000-000000000001'
      and assigned_profile_id = '71000000-0000-4000-8000-000000000003'
      and current_holder_id = '71000000-0000-4000-8000-000000000003'
  ) then raise exception 'Mixed payment assignment/custody did not move'; end if;
  if (select count(*) from public.ledger_entries where source_type = 'transfer' and source_id = '74000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'Mixed accepted transfer did not create exactly two ledger entries';
  end if;
  if (select coalesce(sum(abs(amount)), 0) from public.ledger_entries where source_type = 'transfer' and source_id = '74000000-0000-4000-8000-000000000001') <> 80 then
    raise exception 'Mixed accepted transfer posted more than its cash portion';
  end if;
end $$;

-- Repeating the same response is idempotent.
select public.lenden_respond_payment_transfer(
  '74000000-0000-4000-8000-000000000001', 'accepted', current_date
);

select public.lenden_respond_payment_transfer(
  '74000000-0000-4000-8000-000000000002', 'accepted', current_date
);

do $$
begin
  if not exists (
    select 1 from public.payments
    where id = '73000000-0000-4000-8000-000000000002'
      and assigned_profile_id = '71000000-0000-4000-8000-000000000003'
      and current_holder_id is null
  ) then raise exception 'Online-only assignment did not move correctly'; end if;
  if exists (select 1 from public.ledger_entries where source_id = '74000000-0000-4000-8000-000000000002') then
    raise exception 'Online-only transfer created cash ledger entries';
  end if;
end $$;

select public.lenden_respond_payment_transfer(
  '74000000-0000-4000-8000-000000000003', 'rejected', current_date
);

do $$
begin
  if not exists (
    select 1 from public.payments
    where id = '73000000-0000-4000-8000-000000000003'
      and assigned_profile_id = '71000000-0000-4000-8000-000000000002'
      and current_holder_id = '71000000-0000-4000-8000-000000000002'
  ) then raise exception 'Rejected transfer changed assignment or custody'; end if;
end $$;

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000005', true);
do $$
begin
  begin
    perform public.lenden_respond_payment_transfer(
      '74000000-0000-4000-8000-000000000004', 'accepted', current_date
    );
    raise exception 'Recipient without permission accepted a transfer';
  exception when others then
    if sqlerrm = 'Recipient without permission accepted a transfer' then raise; end if;
  end;
end $$;

-- Multi-hop acceptance moves the complete assignment once more and posts only cash.
reset role;
insert into public.money_movements (
  id, business_id, type, mode, amount, payment_id, from_profile_id, to_profile_id, requested_by
) values (
  '74000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000001', 'transfer', 'mixed', 100,
  '73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000003'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
select public.lenden_respond_payment_transfer(
  '74000000-0000-4000-8000-000000000005', 'accepted', current_date
);

do $$
begin
  if not exists (
    select 1 from public.payments
    where id = '73000000-0000-4000-8000-000000000001'
      and assigned_profile_id = '71000000-0000-4000-8000-000000000004'
      and current_holder_id = '71000000-0000-4000-8000-000000000004'
  ) then raise exception 'Multi-hop transfer did not move assignment/custody'; end if;
end $$;

-- Course activity is durable and manual; an expired date does not make it inactive.
reset role;
insert into public.courses (id, business_id, name, kind) values
  ('75000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Test Course', 'main'),
  ('75000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'Test Course', 'skill');

do $$
begin
  if (
    select count(*)
    from public.courses
    where business_id = '72000000-0000-4000-8000-000000000001'
      and lower(btrim(name)) = 'test course'
  ) <> 2 then
    raise exception 'Same-name main and skill courses were not both retained';
  end if;
  update public.courses
  set active = false
  where id = '75000000-0000-4000-8000-000000000001';
  update public.courses
  set active = true
  where id = '75000000-0000-4000-8000-000000000001';
end $$;

insert into public.course_students (
  id, business_id, source_course_id, identity_key, roll_number, student_name,
  photo_url, phone_number, address, aadhar_number, subscription_end_date, active
) values (
  '76000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001', 'roll:1', '1', 'Expired but active',
  'course/profile.jpg', '9999999999', 'Course student address', '123412341234', current_date - 30, true
);

insert into public.payments (
  id, business_id, business_type, mode, amount, cash_collection, online_collection,
  fee_amount, paid_amount, dues_amount, advance_amount, payment_date, start_date, end_date,
  start_time, end_time, slot_hours, customer_name, roll_number, course_id, course_student_id,
  student_subscription_key, collected_by, assigned_profile_id, current_holder_id,
  approval_status, cash_approval_status, online_approval_status, record_status, created_at
) values
  (
    '73000000-0000-4000-8000-000000000010', '72000000-0000-4000-8000-000000000001',
    'course', 'mixed', 100, 40, 60, 200, 100, 100, 0, current_date - 40,
    current_date - 45, current_date - 15, '06:00', '07:00', 1, 'Expired but active', '1',
    '75000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'course-cycle-one', '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    'pending', 'approved', 'pending', 'active', now() - interval '40 days'
  ),
  (
    '73000000-0000-4000-8000-000000000011', '72000000-0000-4000-8000-000000000001',
    'course', 'cash', 50, 50, 0, 200, 150, 50, 0, current_date - 30,
    current_date - 45, current_date - 15, '06:00', '07:00', 1, 'Expired but active', '1',
    '75000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'course-cycle-one', '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    'pending', 'pending', null, 'active', now() - interval '30 days'
  ),
  (
    '73000000-0000-4000-8000-000000000012', '72000000-0000-4000-8000-000000000001',
    'course', 'cash', 25, 25, 0, 200, 175, 25, 0, current_date - 25,
    current_date - 45, current_date - 15, '06:00', '07:00', 1, 'Expired but active', '1',
    '75000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'course-cycle-one', '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    'cancelled', 'cancelled', null, 'cancelled', now() - interval '25 days'
  ),
  (
    '73000000-0000-4000-8000-000000000013', '72000000-0000-4000-8000-000000000001',
    'course', 'online', 300, 0, 300, 300, 300, 0, 0, current_date,
    current_date, current_date + 30, '06:00', '07:00', 1, 'Expired but active', '1',
    '75000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001',
    'course-cycle-two', '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002', null,
    'approved', null, 'approved', 'active', now()
  );

update public.course_students
set last_payment_id = '73000000-0000-4000-8000-000000000013',
    current_subscription_key = 'course-cycle-two'
where id = '76000000-0000-4000-8000-000000000001';

insert into public.library_students (
  id, business_id, roll_number, student_name, subscription_start_date,
  subscription_end_date, fee_amount, paid_amount, dues_amount, active,
  current_subscription_key
) values (
  '76000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001',
  'L-1', 'Library Partial Student', current_date, current_date + 30, 100, 75, 25, true,
  'library-cycle-one'
);

insert into public.payments (
  id, business_id, business_type, mode, amount, cash_collection, online_collection,
  fee_amount, paid_amount, dues_amount, advance_amount, payment_date, start_date, end_date,
  start_time, end_time, slot_hours, customer_name, roll_number, library_student_id,
  student_subscription_key, collected_by, assigned_profile_id, current_holder_id,
  approval_status, cash_approval_status, online_approval_status, record_status, created_at
) values
  (
    '73000000-0000-4000-8000-000000000014', '72000000-0000-4000-8000-000000000001',
    'library', 'cash', 50, 50, 0, 100, 50, 50, 0, current_date - 1,
    current_date, current_date + 30, '08:00', '10:00', 2, 'Library Partial Student', 'L-1',
    '76000000-0000-4000-8000-000000000002', 'library-cycle-one',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002', 'pending', 'pending', null, 'active', now() - interval '1 day'
  ),
  (
    '73000000-0000-4000-8000-000000000015', '72000000-0000-4000-8000-000000000001',
    'library', 'online', 25, 0, 25, 100, 75, 25, 0, current_date,
    current_date, current_date + 30, '08:00', '10:00', 2, 'Library Partial Student', 'L-1',
    '76000000-0000-4000-8000-000000000002', 'library-cycle-one',
    '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002',
    null, 'pending', null, 'pending', 'active', now()
  );

do $$
begin
  if not (select active from public.course_students where id = '76000000-0000-4000-8000-000000000001') then
    raise exception 'Expiry silently deactivated a course student';
  end if;
  if not exists (
    select 1 from public.course_students
    where id = '76000000-0000-4000-8000-000000000001'
      and photo_url = 'course/profile.jpg'
      and phone_number = '9999999999'
      and address = 'Course student address'
      and aadhar_number = '123412341234'
  ) then
    raise exception 'Course student profile fields were not persisted';
  end if;
  update public.course_students set active = false where id = '76000000-0000-4000-8000-000000000001';
  if (select active from public.course_students where id = '76000000-0000-4000-8000-000000000001') then
    raise exception 'Manual inactive status was not persisted';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000004', true);
select set_config('request.headers', '{"x-lenden-business-id":"72000000-0000-4000-8000-000000000001"}', true);

do $$
begin
  if (
    select count(distinct subscription_key)
    from public.lenden_student_subscription_history(
      'course', '76000000-0000-4000-8000-000000000001', null, 0, 10
    )
  ) <> 2 then
    raise exception 'Course history did not return two subscription cycles';
  end if;
  if (
    select max(total_transactions)
    from public.lenden_student_subscription_history(
      'course', '76000000-0000-4000-8000-000000000001', null, 0, 10
    )
  ) <> 4 then
    raise exception 'Course history did not retain every partial/cancelled payment';
  end if;
  if (
    select count(distinct subscription_key)
    from public.lenden_student_subscription_history(
      'course', '76000000-0000-4000-8000-000000000001', null, 0, 1
    )
  ) <> 1 then
    raise exception 'Course history page split more than one subscription cycle';
  end if;
  if (
    select coalesce(sum(payment_amount) filter (where payment_record_status = 'active'), 0)
    from public.lenden_student_subscription_history(
      'course', '76000000-0000-4000-8000-000000000001', null, 1, 1
    )
  ) <> 150 then
    raise exception 'Cancelled course payment affected active subscription totals';
  end if;
  if (
    select max(total_subscriptions)
    from public.lenden_student_subscription_history(
      'library', '76000000-0000-4000-8000-000000000002', 'L-1', 0, 10
    )
  ) <> 1 then
    raise exception 'Library partial payments did not remain in one subscription cycle';
  end if;
end $$;

rollback;
