alter table public.payments
  add column if not exists cash_posted_on date,
  add column if not exists online_posted_on date,
  add column if not exists cash_approved_by uuid,
  add column if not exists online_approved_by uuid;

alter table public.expenses
  add column if not exists posted_on date,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

-- Existing approved records keep their historical transaction date. New
-- staff-created records receive their posting date only when an owner approves
-- the corresponding value.
update public.payments p
set
  cash_posted_on = case
    when coalesce(p.cash_collection, case when p.mode = 'cash' then p.amount else 0 end) > 0
      and coalesce(p.cash_approval_status::text, p.approval_status::text) = 'approved'
      then coalesce(p.cash_posted_on, p.payment_date)
    else p.cash_posted_on
  end,
  online_posted_on = case
    when coalesce(p.online_collection, case when p.mode = 'online' then p.amount else 0 end) > 0
      and coalesce(p.online_approval_status::text, p.approval_status::text) = 'approved'
      then coalesce(p.online_posted_on, p.payment_date)
    else p.online_posted_on
  end,
  cash_approved_by = case
    when coalesce(p.cash_approval_status::text, p.approval_status::text) = 'approved'
      then coalesce(p.cash_approved_by, p.approved_by)
    else p.cash_approved_by
  end,
  online_approved_by = case
    when coalesce(p.online_approval_status::text, p.approval_status::text) = 'approved'
      then coalesce(p.online_approved_by, p.approved_by)
    else p.online_approved_by
  end
where p.approval_status = 'approved'
   or p.cash_approval_status = 'approved'
   or p.online_approval_status = 'approved';

update public.expenses e
set
  posted_on = coalesce(e.posted_on, e.expense_date),
  approved_at = coalesce(e.approved_at, e.updated_at, e.created_at),
  approved_by = coalesce(
    e.approved_by,
    case
      when exists (
        select 1
        from public.business_memberships bm
        where bm.business_id = e.business_id
          and bm.profile_id = e.spent_by
          and bm.role in ('primary_owner', 'co_owner')
      ) then e.spent_by
      else null
    end
  )
where e.approval_status = 'approved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_cash_approver_membership_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payment_cash_approver_membership_fkey
      foreign key (business_id, cash_approved_by)
      references public.business_memberships(business_id, profile_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_online_approver_membership_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payment_online_approver_membership_fkey
      foreign key (business_id, online_approved_by)
      references public.business_memberships(business_id, profile_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expense_approver_membership_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expense_approver_membership_fkey
      foreign key (business_id, approved_by)
      references public.business_memberships(business_id, profile_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists payments_cash_posted_on_idx
  on public.payments (business_id, cash_posted_on desc)
  where cash_posted_on is not null and record_status = 'active';

create index if not exists payments_online_posted_on_idx
  on public.payments (business_id, online_posted_on desc)
  where online_posted_on is not null and record_status = 'active';

create index if not exists expenses_posted_on_idx
  on public.expenses (business_id, posted_on desc)
  where posted_on is not null and record_status = 'active';

comment on column public.payments.cash_posted_on is
  'Business-local accounting date on which the approved cash component enters finalized IN/OUT.';
comment on column public.payments.online_posted_on is
  'Business-local accounting date on which the approved online component enters finalized IN/OUT.';
comment on column public.expenses.posted_on is
  'Business-local accounting date on which the approved expense enters finalized IN/OUT.';
