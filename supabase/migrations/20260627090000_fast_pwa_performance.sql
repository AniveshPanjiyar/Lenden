create index if not exists payments_payment_date_status_idx
  on public.payments (payment_date desc, record_status, approval_status);

create index if not exists expenses_expense_date_status_idx
  on public.expenses (expense_date desc, record_status, approval_status);

create index if not exists money_movements_created_status_idx
  on public.money_movements (created_at desc, status);

create index if not exists ledger_entries_date_account_idx
  on public.ledger_entries (entry_date desc, account_profile_id);

create or replace function public.lenden_closing_summaries(p_closing_date date)
returns table (
  profile_id uuid,
  full_name text,
  role public.app_role,
  opening numeric,
  collected numeric,
  expenses numeric,
  received numeric,
  sent numeric,
  adjustments numeric,
  closing numeric
)
language sql
stable
as $$
  select
    profiles.id as profile_id,
    profiles.full_name,
    profiles.role,
    coalesce(sum(ledger_entries.amount) filter (where ledger_entries.entry_date < p_closing_date), 0) as opening,
    coalesce(
      sum(ledger_entries.amount) filter (
        where ledger_entries.entry_date = p_closing_date
          and ledger_entries.source_type = 'payment'
          and ledger_entries.amount > 0
      ),
      0
    ) as collected,
    coalesce(
      abs(sum(ledger_entries.amount) filter (
        where ledger_entries.entry_date = p_closing_date
          and ledger_entries.source_type = 'expense'
          and ledger_entries.amount < 0
      )),
      0
    ) as expenses,
    coalesce(
      sum(ledger_entries.amount) filter (
        where ledger_entries.entry_date = p_closing_date
          and ledger_entries.source_type in ('transfer', 'settlement')
          and ledger_entries.amount > 0
      ),
      0
    ) as received,
    coalesce(
      abs(sum(ledger_entries.amount) filter (
        where ledger_entries.entry_date = p_closing_date
          and ledger_entries.source_type in ('transfer', 'settlement')
          and ledger_entries.amount < 0
      )),
      0
    ) as sent,
    coalesce(
      sum(ledger_entries.amount) filter (
        where ledger_entries.entry_date = p_closing_date
          and ledger_entries.source_type = 'adjustment'
      ),
      0
    ) as adjustments,
    coalesce(sum(ledger_entries.amount), 0) as closing
  from public.profiles
  left join public.ledger_entries
    on ledger_entries.account_profile_id = profiles.id
   and ledger_entries.entry_date <= p_closing_date
  where profiles.active = true
  group by profiles.id, profiles.full_name, profiles.role
  order by profiles.full_name;
$$;

grant execute on function public.lenden_closing_summaries(date) to authenticated;
