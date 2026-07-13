alter table public.payments
  add column if not exists cash_approval_status public.approval_status,
  add column if not exists online_approval_status public.approval_status,
  add column if not exists cash_approved_at timestamptz,
  add column if not exists online_approved_at timestamptz;

update public.payments
set
  cash_approval_status = case
    when cash_collection > 0 then coalesce(cash_approval_status, approval_status)
    else null
  end,
  online_approval_status = case
    when online_collection > 0 then coalesce(online_approval_status, approval_status)
    else null
  end,
  cash_approved_at = case
    when cash_collection > 0 and approval_status = 'approved'
      then coalesce(cash_approved_at, updated_at, created_at)
    else null
  end,
  online_approved_at = case
    when online_collection > 0 and approval_status = 'approved'
      then coalesce(online_approved_at, updated_at, created_at)
    else null
  end
where cash_approval_status is null
   or online_approval_status is null;

comment on column public.payments.cash_approved_at is
  'Absolute approval instant; application displays this in Asia/Kolkata.';

comment on column public.payments.online_approved_at is
  'Absolute approval instant; application displays this in Asia/Kolkata.';
