alter table public.money_movements
  add column if not exists payment_id uuid references public.payments(id) on delete cascade;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
for select
to authenticated
using (
  (select private.is_ownerish())
  or id = (select auth.uid())
  or (active = true and role in ('staff', 'sales_agent'))
  or (select private.current_user_role()) = 'sales_agent'
);

drop policy if exists "permissions_owner_read" on public.staff_permissions;
create policy "permissions_owner_read" on public.staff_permissions
for select
to authenticated
using (
  (select private.is_ownerish())
  or profile_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.id = staff_permissions.profile_id
      and p.active = true
      and p.role in ('staff', 'sales_agent')
  )
);

create index if not exists money_movements_payment_id_idx
  on public.money_movements (payment_id, created_at desc)
  where payment_id is not null;

create unique index if not exists money_movements_one_pending_payment_transfer_idx
  on public.money_movements (payment_id)
  where payment_id is not null
    and type = 'transfer'
    and status = 'pending';

drop policy if exists "payments_select_visible" on public.payments;
create policy "payments_select_visible" on public.payments
for select
to authenticated
using (
  (select private.is_ownerish())
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
