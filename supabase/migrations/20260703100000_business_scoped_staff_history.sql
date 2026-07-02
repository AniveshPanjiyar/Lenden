drop policy if exists "payments_select_visible" on public.payments;
create policy "payments_select_visible" on public.payments
for select
to authenticated
using (
  (select private.is_ownerish())
  or (select private.can_collect(payments.business_type))
  or collected_by = (select auth.uid())
  or current_holder_id = (select auth.uid())
  or referral_agent_id = (select auth.uid())
  or exists (
    select 1
    from public.referral_codes rc
    where rc.id = payments.referral_code_id
      and rc.agent_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.money_movements mm
    where mm.payment_id = payments.id
      and mm.to_profile_id = (select auth.uid())
      and mm.status = 'pending'
  )
);

drop policy if exists "expenses_select_visible" on public.expenses;
create policy "expenses_select_visible" on public.expenses
for select
to authenticated
using (
  (select private.is_ownerish())
  or spent_by = (select auth.uid())
  or (
    expenses.business_type is not null
    and (select private.can_collect(expenses.business_type))
  )
);

create index if not exists expenses_business_date_idx
  on public.expenses (business_type, expense_date desc);
