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
  );

select set_config('request.headers', '{"x-lenden-business-id":"97000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;

select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', true);
do $$
declare
  cash_position jsonb;
begin
  select public.lenden_dashboard_cash_position(current_date) into cash_position;
  if (cash_position ->> 'cashSelf')::numeric <> 40
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
      '98000000-0000-4000-8000-000000000002'
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
      and category = 'cash_received'
      and amount = 40
  ) <> 1 then
    raise exception 'Manager did not receive one Cash Received entry from the Sales Agent';
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
    or (cash_position ->> 'cashWithStaff')::numeric <> 100 then
    raise exception 'Owner did not see Manager plus Sales Agent cash: %', cash_position;
  end if;

  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '98000000-0000-4000-8000-000000000001'
      and category in ('cash_received', 'cash_sent')
      and business_type is null
  ) <> 2 then
    raise exception 'Owner transfer did not produce one unit-free Cash Sent/Cash Received pair';
  end if;

  if (public.lenden_dashboard_summary(current_date, current_date) #>> '{reconciliation,variance}')::numeric <> 0 then
    raise exception 'Owner cash reconciliation did not balance';
  end if;
end;
$$;

reset role;

-- Simulate a historical accepted transfer with no ledger rows. The repair is
-- idempotent, removes its stale unit tag, and creates the signed pair.
insert into public.money_movements (
  id, business_id, type, mode, amount, business_type,
  from_profile_id, to_profile_id, status, requested_by, responded_by,
  responded_at, client_request_id
) values (
  '98000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000001',
  'transfer', 'cash', 200, 'general',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000003',
  'accepted',
  '96000000-0000-4000-8000-000000000002',
  '96000000-0000-4000-8000-000000000002',
  now(), 'historical-missing-ledger-pair'
);

do $$
declare
  first_backfill_count integer;
  second_backfill_count integer;
begin
  first_backfill_count := private.lenden_backfill_cash_transfer_ledgers();
  second_backfill_count := private.lenden_backfill_cash_transfer_ledgers();
  if first_backfill_count <> 2 or second_backfill_count <> 0 then
    raise exception 'Historical transfer ledger backfill was not pair-complete and idempotent';
  end if;

  if (
    select count(*)
    from public.ledger_entries
    where source_id = '98000000-0000-4000-8000-000000000003'
      and source_type = 'transfer'
      and business_type is null
  ) <> 2
    or (
      select coalesce(sum(amount), 0)
      from public.ledger_entries
      where source_id = '98000000-0000-4000-8000-000000000003'
        and source_type = 'transfer'
    ) <> 0
    or (
      select business_type
      from public.money_movements
      where id = '98000000-0000-4000-8000-000000000003'
    ) is not null then
    raise exception 'Historical transfer did not become a balanced, unit-free pair';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000002', true);
do $$
declare
  cash_position jsonb;
begin
  select public.lenden_dashboard_cash_position(current_date) into cash_position;
  if (cash_position ->> 'cashSelf')::numeric <> -160
    or (cash_position ->> 'cashWithStaff')::numeric <> 260 then
    raise exception 'Negative Manager balance or positive lower-role cash was hidden: %', cash_position;
  end if;

  if (
    select count(*)
    from public.lenden_financial_activity(current_date, current_date)
    where source_id = '98000000-0000-4000-8000-000000000003'
      and category in ('cash_received', 'cash_sent')
      and business_type is null
  ) <> 2 then
    raise exception 'Manager did not see the complete lower-role transfer pair';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-000000000001', true);
do $$
declare
  cash_position jsonb;
  summary jsonb;
begin
  select public.lenden_dashboard_cash_position(current_date) into cash_position;
  select public.lenden_dashboard_summary(current_date, current_date) into summary;
  if (cash_position ->> 'cashWithStaff')::numeric <> 260
    or (cash_position ->> 'negativeBalanceAmount')::numeric <> 160
    or (cash_position ->> 'negativeBalanceCount')::integer <> 1 then
    raise exception 'Owner team cash did not separate positive custody and negative variance: %', cash_position;
  end if;
  if (summary #>> '{reconciliation,variance}')::numeric <> 0 then
    raise exception 'Internal transfer did not cancel from Owner reconciliation: %', summary;
  end if;
end;
$$;

rollback;
