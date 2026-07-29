-- Manual user-to-user cash transfers are organization-scoped personal flows.
-- Keep the organization as the tenant boundary, but remove business-unit
-- attribution and repair any historical accepted movement missing one side of
-- its equal-and-opposite cash ledger pair.

update public.money_movements movement
set business_type = null
where movement.payment_id is null
  and movement.status = 'accepted'
  and movement.type in ('transfer', 'settlement')
  and movement.business_type is not null;

update public.ledger_entries ledger
set business_type = null
from public.money_movements movement
where movement.id = ledger.source_id
  and movement.business_id = ledger.business_id
  and movement.payment_id is null
  and movement.status = 'accepted'
  and movement.type in ('transfer', 'settlement')
  and ledger.source_type = movement.type::text
  and ledger.business_type is not null;

with manual_cash_movements as (
  select
    movement.*,
    coalesce(
      (
        select min(existing.entry_date)
        from public.ledger_entries existing
        where existing.business_id = movement.business_id
          and existing.source_type = movement.type::text
          and existing.source_id = movement.id
      ),
      (
        coalesce(movement.responded_at, movement.created_at)
        at time zone business.timezone
      )::date
    ) as entry_date
  from public.money_movements movement
  join public.businesses business on business.id = movement.business_id
  where movement.payment_id is null
    and movement.status = 'accepted'
    and movement.type in ('transfer', 'settlement')
    and movement.to_profile_id is not null
    and movement.amount > 0
)
insert into public.ledger_entries (
  business_id,
  business_type,
  account_profile_id,
  amount,
  entry_date,
  source_type,
  source_id,
  description,
  created_by
)
select
  movement.business_id,
  null,
  movement.from_profile_id,
  -movement.amount,
  movement.entry_date,
  movement.type::text,
  movement.id,
  'Cash sent to ' || recipient.full_name,
  coalesce(movement.responded_by, movement.requested_by)
from manual_cash_movements movement
join public.profiles recipient on recipient.id = movement.to_profile_id
where not exists (
  select 1
  from public.ledger_entries existing
  where existing.business_id = movement.business_id
    and existing.source_type = movement.type::text
    and existing.source_id = movement.id
    and existing.account_profile_id = movement.from_profile_id
);

with manual_cash_movements as (
  select
    movement.*,
    coalesce(
      (
        select min(existing.entry_date)
        from public.ledger_entries existing
        where existing.business_id = movement.business_id
          and existing.source_type = movement.type::text
          and existing.source_id = movement.id
      ),
      (
        coalesce(movement.responded_at, movement.created_at)
        at time zone business.timezone
      )::date
    ) as entry_date
  from public.money_movements movement
  join public.businesses business on business.id = movement.business_id
  where movement.payment_id is null
    and movement.status = 'accepted'
    and movement.type in ('transfer', 'settlement')
    and movement.to_profile_id is not null
    and movement.amount > 0
)
insert into public.ledger_entries (
  business_id,
  business_type,
  account_profile_id,
  amount,
  entry_date,
  source_type,
  source_id,
  description,
  created_by
)
select
  movement.business_id,
  null,
  movement.to_profile_id,
  movement.amount,
  movement.entry_date,
  movement.type::text,
  movement.id,
  'Cash received from ' || sender.full_name,
  coalesce(movement.responded_by, movement.requested_by)
from manual_cash_movements movement
join public.profiles sender on sender.id = movement.from_profile_id
where not exists (
  select 1
  from public.ledger_entries existing
  where existing.business_id = movement.business_id
    and existing.source_type = movement.type::text
    and existing.source_id = movement.id
    and existing.account_profile_id = movement.to_profile_id
);
