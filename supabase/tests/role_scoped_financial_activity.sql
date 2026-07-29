-- Run with `supabase test db` after applying all migrations.
begin;

grant usage on schema public, private to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

insert into auth.users (id) values
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000003'),
  ('91000000-0000-4000-8000-000000000004'),
  ('91000000-0000-4000-8000-000000000005');

insert into public.profiles (id, email, full_name, role) values
  ('91000000-0000-4000-8000-000000000001', 'scope-owner@test.invalid', 'Scope Owner', 'owner'),
  ('91000000-0000-4000-8000-000000000002', 'scope-manager-a@test.invalid', 'Manager A', 'owner'),
  ('91000000-0000-4000-8000-000000000003', 'scope-manager-b@test.invalid', 'Manager B', 'owner'),
  ('91000000-0000-4000-8000-000000000004', 'scope-staff-a@test.invalid', 'Staff A', 'staff'),
  ('91000000-0000-4000-8000-000000000005', 'scope-staff-b@test.invalid', 'Staff B', 'staff');

insert into public.businesses (id, name, slug) values
  ('92000000-0000-4000-8000-000000000001', 'Role Scope Test', 'role-scope-test');

insert into public.business_modules (business_id, module, enabled) values
  ('92000000-0000-4000-8000-000000000001', 'library', true),
  ('92000000-0000-4000-8000-000000000001', 'course', true),
  ('92000000-0000-4000-8000-000000000001', 'general', true);

insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'co_owner', 'active', now()),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'co_owner', 'active', now()),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'staff', 'active', now()),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005', 'staff', 'active', now());

insert into public.business_member_permissions (membership_id, permission, granted_by)
select membership.id, permission, '91000000-0000-4000-8000-000000000001'
from public.business_memberships membership
cross join unnest(array[
  'collect_library',
  'collect_course',
  'add_expense',
  'transfer_money'
]) permission
where membership.business_id = '92000000-0000-4000-8000-000000000001'
  and membership.role = 'staff';

insert into public.business_manager_unit_scopes (
  business_id, manager_profile_id, business_type, created_by
) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000002', 'library', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'library', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', 'course', '91000000-0000-4000-8000-000000000001');

insert into public.business_staff_unit_assignments (
  business_id, staff_profile_id, business_type, manager_profile_id, created_by
) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'library', '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000004', 'course', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005', 'course', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001');

insert into public.payments (
  id, business_id, business_type, mode, amount, cash_collection, online_collection,
  description, collected_by, assigned_profile_id, current_holder_id,
  approval_status, cash_approval_status, online_approval_status,
  payment_date, cash_posted_on, online_posted_on
) values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'library', 'cash', 100, 100, 0, 'Library collection',
    '91000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000004',
    'approved', 'approved', null, current_date, current_date, null
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'course', 'online', 200, 0, 200, 'Course collection',
    '91000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000004',
    null,
    'approved', null, 'approved', current_date, null, current_date
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000001',
    'course', 'mixed', 50, 20, 30, 'Partially approved collection',
    '91000000-0000-4000-8000-000000000005',
    '91000000-0000-4000-8000-000000000005',
    '91000000-0000-4000-8000-000000000005',
    'pending', 'approved', 'pending', current_date, current_date, null
  );

insert into public.expenses (
  id, business_id, business_type, mode, amount, expense_date, description,
  spent_by, approval_status, posted_on
) values
  (
    '94000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'course', 'cash', 40, current_date, 'Course supplies',
    '91000000-0000-4000-8000-000000000004', 'approved', current_date
  ),
  (
    '94000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000001',
    'course', 'cash', 10, current_date, 'Course supplies pending',
    '91000000-0000-4000-8000-000000000005', 'pending', null
  );

insert into public.money_movements (
  id, business_id, business_type, type, mode, amount,
  from_profile_id, to_profile_id, status, requested_by, responded_by, responded_at
) values (
  '95000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  null, 'transfer', 'cash', 25,
  '91000000-0000-4000-8000-000000000004',
  '91000000-0000-4000-8000-000000000005',
  'accepted',
  '91000000-0000-4000-8000-000000000004',
  '91000000-0000-4000-8000-000000000005',
  now()
);

insert into public.ledger_entries (
  business_id, business_type, account_profile_id, amount, entry_date,
  source_type, source_id, created_by
) values
  (
    '92000000-0000-4000-8000-000000000001', 'library',
    '91000000-0000-4000-8000-000000000004', 100, current_date,
    'payment', '93000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001', null,
    '91000000-0000-4000-8000-000000000005', 20, current_date,
    'payment', '93000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000001'
  ),
  (
    '92000000-0000-4000-8000-000000000001', null,
    '91000000-0000-4000-8000-000000000004', -25, current_date,
    'transfer', '95000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000004'
  ),
  (
    '92000000-0000-4000-8000-000000000001', 'course',
    '91000000-0000-4000-8000-000000000005', 25, current_date,
    'transfer', '95000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000005'
  ),
  (
    '92000000-0000-4000-8000-000000000001', 'course',
    '91000000-0000-4000-8000-000000000004', -40, current_date,
    'expense', '94000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000004'
  ),
  (
    '92000000-0000-4000-8000-000000000001', null,
    '91000000-0000-4000-8000-000000000002', 30, current_date,
    'settlement', '95000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000004'
  ),
  (
    '92000000-0000-4000-8000-000000000001', null,
    '91000000-0000-4000-8000-000000000003', 40, current_date,
    'settlement', '95000000-0000-4000-8000-000000000003',
    '91000000-0000-4000-8000-000000000004'
  ),
  (
    '92000000-0000-4000-8000-000000000001', 'general',
    '91000000-0000-4000-8000-000000000001', 60, current_date,
    'adjustment', '95000000-0000-4000-8000-000000000004',
    '91000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.headers', '{"x-lenden-business-id":"92000000-0000-4000-8000-000000000001"}', true);

-- Manager A reviews Library activity only, but Closing cash custody includes
-- every Staff member in the same business.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
do $$
declare
  summary jsonb;
  cash_position jsonb;
begin
  select public.lenden_dashboard_summary(current_date, current_date)
  into summary;
  select public.lenden_dashboard_cash_position(current_date)
  into cash_position;
  if (summary #>> '{collections,total}')::numeric <> 100 then
    raise exception 'Manager A collections were not restricted to Library: %', summary;
  end if;
  if (summary #>> '{expenses,total}')::numeric <> 0 then
    raise exception 'Manager A saw a Course expense: %', summary;
  end if;
  if (summary #>> '{pending,amount}')::numeric <> 0
    or (summary #>> '{pending,count}')::integer <> 0 then
    raise exception 'Manager A pending amount/count is wrong: %', summary;
  end if;
  if (
    select status.pending_amount
    from public.lenden_dashboard_business_status(current_date, current_date) status
    where status.business_type = 'library'
  ) <> 0
    or (
      select status.pending_count
      from public.lenden_dashboard_business_status(current_date, current_date) status
      where status.business_type = 'library'
    ) <> 0 then
    raise exception 'Manager A Library status pending amount/count is wrong';
  end if;
  if (cash_position ->> 'cashSelf')::numeric <> 30
    or (cash_position ->> 'cashWithStaff')::numeric <> 80 then
    raise exception 'Manager A cash position is wrong: %', cash_position;
  end if;
  if (
    select count(*)
    from public.lenden_closing_summaries(current_date)
  ) <> 3
    or exists (
      select 1
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000001'
    ) then
    raise exception 'Manager A Closing did not contain every same-business Staff member';
  end if;
  if (
    select closing
    from public.lenden_closing_summaries(current_date)
    where profile_id = '91000000-0000-4000-8000-000000000002'
  ) <> 30
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000004'
    ) <> 35
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000005'
    ) <> 45
    or exists (
      select 1
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000003'
    ) then
    raise exception 'Manager A Closing did not show self plus lower-role cash';
  end if;
  if (
    select count(*)
    from public.business_memberships
    where business_id = '92000000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception 'Manager A could not see the complete business directory';
  end if;
  if exists (
    select 1
    from public.lenden_financial_activity(current_date, current_date)
    where lens = 'business' and business_type = 'course'
  ) then
    raise exception 'Manager A could review Course activity outside the assigned unit';
  end if;
end;
$$;

-- Manager B sees both Library and Course, including Staff A and Staff B.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
do $$
declare
  summary jsonb;
  cash_position jsonb;
begin
  select public.lenden_dashboard_summary(current_date, current_date)
  into summary;
  select public.lenden_dashboard_cash_position(current_date)
  into cash_position;
  if (summary #>> '{collections,total}')::numeric <> 320
    or (summary #>> '{expenses,total}')::numeric <> 40 then
    raise exception 'Manager B Library and Course totals are wrong: %', summary;
  end if;
  if (summary #>> '{pending,amount}')::numeric <> 40
    or (summary #>> '{pending,count}')::integer <> 2 then
    raise exception 'Manager B pending activity is wrong: %', summary;
  end if;
  if (
    select status.pending_amount
    from public.lenden_dashboard_business_status(current_date, current_date) status
    where status.business_type = 'course'
  ) <> 40 then
    raise exception 'Manager B Course pending activity is wrong';
  end if;
  if (cash_position ->> 'cashSelf')::numeric <> 40
    or (cash_position ->> 'cashWithStaff')::numeric <> 80 then
    raise exception 'Manager B combined Staff cash position is wrong: %', cash_position;
  end if;
  if (
    select count(*)
    from public.lenden_closing_summaries(current_date)
  ) <> 3
    or not exists (
      select 1
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000005'
    ) then
    raise exception 'Manager B Closing did not contain every same-business Staff member';
  end if;
  if (
    select closing
    from public.lenden_closing_summaries(current_date)
    where profile_id = '91000000-0000-4000-8000-000000000003'
  ) <> 40
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000004'
    ) <> 35
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000005'
    ) <> 45
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000002'
    ) <> 30 then
    raise exception 'Manager B Closing did not combine Library and Course balances';
  end if;
  if (
    select count(*)
    from public.business_memberships
    where business_id = '92000000-0000-4000-8000-000000000001'
  ) <> 5 then
    raise exception 'Manager B could not see the complete business directory';
  end if;
  if not exists (
    select 1
    from public.lenden_financial_activity(current_date, current_date)
    where lens = 'business' and business_type = 'library'
  ) then
    raise exception 'Manager B could not review the assigned Library activity';
  end if;
end;
$$;

-- Staff business activity follows team assignments; personal flow stays self-only.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000004', true);
do $$
declare
  summary jsonb;
  cash_position jsonb;
begin
  select public.lenden_dashboard_summary(current_date, current_date)
  into summary;
  select public.lenden_dashboard_cash_position(current_date)
  into cash_position;
  if (summary #>> '{collections,total}')::numeric <> 320
    or (summary #>> '{expenses,total}')::numeric <> 40 then
    raise exception 'Staff assigned-team business totals are wrong: %', summary;
  end if;
  if (summary #>> '{cashReceived,total}')::numeric <> 0
    or (summary #>> '{cashSent,total}')::numeric <> 25 then
    raise exception 'Staff Cash Received/Sent totals are wrong: %', summary;
  end if;
  if (summary #>> '{pending,amount}')::numeric <> 0 then
    raise exception 'Staff pending included a teammate record: %', summary;
  end if;
  if (cash_position ->> 'cashSelf')::numeric <> 35
    or (cash_position ->> 'cashWithStaff')::numeric <> 0 then
    raise exception 'Staff cash position included another user: %', cash_position;
  end if;
  if (
    select count(*)
    from public.lenden_closing_summaries(current_date)
  ) <> 1
    or not exists (
      select 1
      from public.lenden_closing_summaries(current_date)
      where profile_id = '91000000-0000-4000-8000-000000000004'
    ) then
    raise exception 'Staff Closing exposed another business member';
  end if;
  if exists (
    select 1
    from public.lenden_financial_activity(current_date, current_date)
    where lens = 'personal' and flow_profile_id is distinct from '91000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'Staff personal feed exposed another profile';
  end if;
  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '95000000-0000-4000-8000-000000000001'
      and lens = 'personal'
      and category = 'cash_sent'
      and amount = 25
  ) <> 1 then
    raise exception 'Accepted cash transfer did not create one Cash Sent row';
  end if;
end;
$$;

-- Recipient receives Cash Received only for the transfer, while the Collection
-- remains business activity and the unapproved mixed component remains pending.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000005', true);
do $$
declare
  summary jsonb;
  cash_position jsonb;
begin
  select public.lenden_dashboard_summary(current_date, current_date)
  into summary;
  select public.lenden_dashboard_cash_position(current_date)
  into cash_position;
  if (summary #>> '{cashReceived,total}')::numeric <> 25
    or (summary #>> '{cashSent,total}')::numeric <> 0 then
    raise exception 'Recipient Cash Received/Sent totals are wrong: %', summary;
  end if;
  if (summary #>> '{pending,amount}')::numeric <> 40
    or (summary #>> '{pending,count}')::integer <> 2 then
    raise exception 'Partial approval pending amount/count is wrong: %', summary;
  end if;
  if (cash_position ->> 'cashSelf')::numeric <> 45
    or (cash_position ->> 'cashWithStaff')::numeric <> 0 then
    raise exception 'Recipient cash position included another user: %', cash_position;
  end if;
  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '95000000-0000-4000-8000-000000000001'
      and lens = 'personal'
      and category = 'cash_received'
      and amount = 25
  ) <> 1 then
    raise exception 'Accepted cash transfer did not create one Cash Received row';
  end if;
end;
$$;

-- Owner sees the complete business without duplicating transfers into business
-- Collections or Expenses.
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
do $$
declare
  summary jsonb;
  cash_position jsonb;
begin
  select public.lenden_dashboard_summary(current_date, current_date)
  into summary;
  select public.lenden_dashboard_cash_position(current_date)
  into cash_position;
  if (summary #>> '{collections,total}')::numeric <> 320
    or (summary #>> '{expenses,total}')::numeric <> 40
    or (summary #>> '{pending,amount}')::numeric <> 40 then
    raise exception 'Owner business totals are wrong: %', summary;
  end if;
  if (
    select status.pending_amount
    from public.lenden_dashboard_business_status(current_date, current_date) status
    where status.business_type = 'course'
  ) <> 40
    or (
      select status.pending_count
      from public.lenden_dashboard_business_status(current_date, current_date) status
      where status.business_type = 'course'
    ) <> 2 then
    raise exception 'Owner Course status pending amount/count is wrong';
  end if;
  if (cash_position ->> 'cashSelf')::numeric <> 0
    or (cash_position ->> 'cashWithStaff')::numeric <> 150 then
    raise exception 'Owner cash position did not combine Managers and Staff: %', cash_position;
  end if;
  if exists (
    select 1
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '95000000-0000-4000-8000-000000000001'
      and lens = 'business'
  ) then
    raise exception 'Cash transfer was incorrectly classified as business activity';
  end if;
end;
$$;

rollback;
