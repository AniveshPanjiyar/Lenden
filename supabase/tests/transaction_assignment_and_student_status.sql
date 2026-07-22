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
  ('71000000-0000-4000-8000-000000000005');

insert into public.profiles (id, email, full_name, role) values
  ('71000000-0000-4000-8000-000000000001', 'assignment-owner@test.invalid', 'Assignment Owner', 'owner'),
  ('71000000-0000-4000-8000-000000000002', 'assignment-staff1@test.invalid', 'Staff 1', 'staff'),
  ('71000000-0000-4000-8000-000000000003', 'assignment-staff2@test.invalid', 'Staff 2', 'staff'),
  ('71000000-0000-4000-8000-000000000004', 'assignment-staff3@test.invalid', 'Staff 3', 'staff'),
  ('71000000-0000-4000-8000-000000000005', 'assignment-no-permission@test.invalid', 'No Permission', 'staff');

insert into public.businesses (id, name, slug) values
  ('72000000-0000-4000-8000-000000000001', 'Assignment Test', 'assignment-test');

insert into public.business_modules (business_id, module, enabled) values
  ('72000000-0000-4000-8000-000000000001', 'general', true),
  ('72000000-0000-4000-8000-000000000001', 'course', true);

insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 'staff', 'active', now()),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000005', 'staff', 'active', now());

insert into public.business_member_permissions (membership_id, permission)
select id, permission
from public.business_memberships
cross join lateral unnest(array['collect_general', 'collect_course']) as permissions(permission)
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
    'Permission assignment test', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'pending', 'pending', null);

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
  ('75000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Test Course', 'main');
insert into public.course_students (
  id, business_id, source_course_id, identity_key, roll_number, student_name,
  photo_url, phone_number, address, aadhar_number, subscription_end_date, active
) values (
  '76000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001', 'roll:1', '1', 'Expired but active',
  'course/profile.jpg', '9999999999', 'Course student address', '123412341234', current_date - 30, true
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

rollback;
