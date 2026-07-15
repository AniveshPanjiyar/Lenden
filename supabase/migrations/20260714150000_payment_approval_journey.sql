alter table public.payments
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz;

update public.payments p
set approved_at = coalesce(
  case
    when p.cash_approved_at is not null and p.online_approved_at is not null
      then greatest(p.cash_approved_at, p.online_approved_at)
    else coalesce(p.cash_approved_at, p.online_approved_at)
  end,
  p.updated_at,
  p.created_at
)
where p.approval_status = 'approved'
  and p.approved_at is null;

-- The collector is a reliable historical approver only when they held an
-- Owner or Manager membership. Older staff-created approvals retain a null
-- actor and are displayed as approved without inventing an approver name.
update public.payments p
set approved_by = p.collected_by
where p.approval_status = 'approved'
  and p.approved_by is null
  and exists (
    select 1
    from public.business_memberships bm
    where bm.business_id = p.business_id
      and bm.profile_id = p.collected_by
      and bm.role in ('primary_owner', 'co_owner')
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_approver_membership_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payment_approver_membership_fkey
      foreign key (business_id, approved_by)
      references public.business_memberships(business_id, profile_id)
      on delete restrict;
  end if;
end
$$;

create index if not exists payments_approved_by_idx
  on public.payments (business_id, approved_by, approved_at desc)
  where approved_by is not null;

comment on column public.payments.approved_by is
  'Owner or Manager who completed final payment approval.';

comment on column public.payments.approved_at is
  'Timestamp when the payment journey reached final approval.';
