-- Run with `supabase test db` after applying all migrations.
begin;

grant usage on schema public, private to authenticated;
grant select on all tables in schema public to authenticated;

insert into auth.users (id) values
  ('96000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-000000000002'),
  ('96000000-0000-4000-8000-000000000003'),
  ('96000000-0000-4000-8000-000000000004');

insert into public.profiles (id, email, full_name, role) values
  ('96000000-0000-4000-8000-000000000001', 'cash-owner@test.invalid', 'Cash Owner', 'owner'),
  ('96000000-0000-4000-8000-000000000002', 'cash-manager@test.invalid', 'Cash Manager', 'owner'),
  ('96000000-0000-4000-8000-000000000003', 'cash-staff@test.invalid', 'Cash Staff', 'staff'),
  ('96000000-0000-4000-8000-000000000004', 'cash-agent@test.invalid', 'Cash Agent', 'sales_agent');

insert into public.businesses (id, name, slug) values
  ('97000000-0000-4000-8000-000000000001', 'Organization Cash Test', 'organization-cash-test');

insert into public.business_modules (business_id, module, enabled) values
  ('97000000-0000-4000-8000-000000000001', 'general', true);

insert into public.business_memberships (business_id, profile_id, role, status, joined_at) values
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', 'primary_owner', 'active', now()),
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', 'co_owner', 'active', now()),
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000003', 'staff', 'active', now()),
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000004', 'sales_agent', 'active', now());

insert into public.money_movements (
  id, business_id, type, mode, amount, business_type,
  from_profile_id, to_profile_id, status, requested_by, responded_by,
  responded_at, client_request_id
) values
  (
    '98000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    'transfer', 'cash', 100, null,
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000004',
    'accepted',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    now(), 'owner-to-agent'
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    '97000000-0000-4000-8000-000000000001',
    'transfer', 'cash', 40, null,
    '96000000-0000-4000-8000-000000000004',
    '96000000-0000-4000-8000-000000000002',
    'accepted',
    '96000000-0000-4000-8000-000000000002',
    '96000000-0000-4000-8000-000000000002',
    now(), 'manager-from-agent'
  ),
  (
    '98000000-0000-4000-8000-000000000003',
    '97000000-0000-4000-8000-000000000001',
    'transfer', 'cash', 500, null,
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000002',
    'accepted',
    '96000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    now(), 'owner-clears-manager-negative'
  );

insert into public.ledger_entries (
  business_id, account_profile_id, business_type, amount, entry_date,
  source_type, source_id, description, created_by
) values
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    null, -100, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000001',
    'Cash sent to Agent',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000004',
    null, 100, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000001',
    'Cash received from Owner',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000004',
    null, -40, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000002',
    'Cash sent to Manager',
    '96000000-0000-4000-8000-000000000002'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000002',
    null, 40, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000002',
    'Cash received from Agent',
    '96000000-0000-4000-8000-000000000002'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000002',
    null, -540, current_date - 1, 'adjustment',
    null,
    'Opening reconciliation amount owed to Manager',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    null, -500, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000003',
    'Cash sent to Manager',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000002',
    null, 500, current_date, 'transfer',
    '98000000-0000-4000-8000-000000000003',
    'Cash received from Owner',
    '96000000-0000-4000-8000-000000000001'
  );

select set_config('request.headers', '{"x-lenden-business-id":"97000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;

select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', true);
do $$
declare
  cash_position jsonb;
begin
  select public.lenden_dashboard_cash_position(current_date) into cash_position;
  if (cash_position ->> 'cashSelf')::numeric <> 0
    or (cash_position ->> 'cashWithStaff')::numeric <> 60 then
    raise exception 'Manager organization cash position is wrong: %', cash_position;
  end if;

  if (
    select count(*)
    from public.lenden_closing_summaries(current_date)
  ) <> 3
    or (
      select closing
      from public.lenden_closing_summaries(current_date)
      where profile_id = '96000000-0000-4000-8000-000000000004'
    ) <> 60 then
    raise exception 'Manager Closing did not include the Sales Agent cash balance';
  end if;

  if exists (
    select 1
    from public.lenden_financial_activity(current_date, current_date)
    where source_id in (
      '98000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000002',
      '98000000-0000-4000-8000-000000000003'
    )
      and lens = 'business'
  ) then
    raise exception 'Organization cash transfer appeared as business activity';
  end if;

  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '98000000-0000-4000-8000-000000000002'
      and lens = 'personal'
      and category = 'in'
      and amount = 40
  ) <> 1 then
    raise exception 'Manager did not receive one personal IN entry from the Sales Agent';
  end if;

  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '98000000-0000-4000-8000-000000000003'
      and lens = 'personal'
      and category = 'in'
      and amount = 500
  ) <> 1 then
    raise exception 'Owner cash sent did not appear as one Manager personal IN entry';
  end if;

  if (
    select closing
    from public.lenden_closing_summaries(current_date)
    where profile_id = '96000000-0000-4000-8000-000000000002'
  ) <> 0 then
    raise exception 'Owner cash sent did not clear the Manager negative balance';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
do $$
declare
  cash_position jsonb;
begin
  select public.lenden_dashboard_cash_position(current_date) into cash_position;
  if (cash_position ->> 'cashSelf')::numeric <> 0
    or (cash_position ->> 'cashWithStaff')::numeric <> 60 then
    raise exception 'Owner did not see Manager plus Sales Agent cash: %', cash_position;
  end if;

  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '98000000-0000-4000-8000-000000000003'
      and lens = 'personal'
      and category = 'out'
      and amount = 500
  ) <> 1 then
    raise exception 'Owner cash sent did not appear as one Owner personal OUT entry';
  end if;
end;
$$;

reset role;

do $$
declare
  movement_id uuid;
begin
  foreach movement_id in array array[
    '98000000-0000-4000-8000-000000000001'::uuid,
    '98000000-0000-4000-8000-000000000002'::uuid,
    '98000000-0000-4000-8000-000000000003'::uuid
  ]
  loop
    if (
      select count(*)
      from public.ledger_entries
      where business_id = '97000000-0000-4000-8000-000000000001'
        and source_type = 'transfer'
        and source_id = movement_id
    ) <> 2 then
      raise exception 'Cash transfer % does not have exactly two ledger entries', movement_id;
    end if;

    if (
      select coalesce(sum(amount), 0)
      from public.ledger_entries
      where business_id = '97000000-0000-4000-8000-000000000001'
        and source_type = 'transfer'
        and source_id = movement_id
    ) <> 0 then
      raise exception 'Cash transfer % ledger entries are not equal and opposite', movement_id;
    end if;

    if exists (
      select 1
      from public.ledger_entries
      where business_id = '97000000-0000-4000-8000-000000000001'
        and source_type = 'transfer'
        and source_id = movement_id
        and business_type is not null
    ) then
      raise exception 'Cash transfer % retained a business-unit tag', movement_id;
    end if;
  end loop;
end;
$$;

rollback;
