-- Focused operational read acceleration. All functions remain RLS-aware and
-- derive the tenant from the authenticated request header.

create index if not exists payments_business_cash_posted_created_idx
  on public.payments (business_id, cash_posted_on desc, created_at desc)
  where record_status = 'active' and cash_posted_on is not null;

create index if not exists payments_business_online_posted_created_idx
  on public.payments (business_id, online_posted_on desc, created_at desc)
  where record_status = 'active' and online_posted_on is not null;

create index if not exists expenses_business_posted_created_idx
  on public.expenses (business_id, posted_on desc, created_at desc)
  where record_status = 'active' and posted_on is not null;

create index if not exists payments_business_pending_review_idx
  on public.payments (business_id, payment_date desc, created_at desc)
  where record_status = 'active'
    and approval_status in ('pending', 'reapproval_required', 'cancel_requested');

create index if not exists expenses_business_pending_review_idx
  on public.expenses (business_id, expense_date desc, created_at desc)
  where record_status = 'active'
    and approval_status in ('pending', 'reapproval_required', 'cancel_requested');

create index if not exists ledger_business_account_date_idx
  on public.ledger_entries (business_id, account_profile_id, entry_date desc);

create index if not exists library_students_business_status_expiry_idx
  on public.library_students (business_id, active, subscription_end_date, roll_number);

create or replace function public.lenden_current_cash_balances()
returns table (
  profile_id uuid,
  balance numeric
)
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    bm.profile_id,
    coalesce(sum(le.amount), 0)::numeric as balance
  from public.business_memberships bm
  left join public.ledger_entries le
    on le.business_id = bm.business_id
   and le.account_profile_id = bm.profile_id
  where bm.business_id = private.requested_business_id()
    and bm.status = 'active'
  group by bm.profile_id
  order by bm.profile_id;
$$;

grant execute on function public.lenden_current_cash_balances() to authenticated;
