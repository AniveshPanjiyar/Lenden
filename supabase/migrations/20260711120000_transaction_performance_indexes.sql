create index if not exists payments_dashboard_date_created_idx
  on public.payments (payment_date desc, created_at desc);

create index if not exists expenses_dashboard_date_created_idx
  on public.expenses (expense_date desc, created_at desc);

create index if not exists payments_pending_review_date_created_idx
  on public.payments (approval_status, payment_date desc, created_at desc)
  where record_status = 'active'
    and approval_status in ('pending', 'reapproval_required', 'cancel_requested');

create index if not exists expenses_pending_review_date_created_idx
  on public.expenses (approval_status, expense_date desc, created_at desc)
  where record_status = 'active'
    and approval_status in ('pending', 'reapproval_required', 'cancel_requested');

create index if not exists record_change_requests_created_idx
  on public.record_change_requests (created_at desc);

create index if not exists agent_settlements_created_idx
  on public.agent_settlements (created_at desc);

create or replace function public.lenden_profile_cash_balance_at(
  p_profile_id uuid,
  p_entry_date date
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)
  from public.ledger_entries
  where account_profile_id = p_profile_id
    and entry_date <= p_entry_date;
$$;

grant execute on function public.lenden_profile_cash_balance_at(uuid, date) to authenticated;
