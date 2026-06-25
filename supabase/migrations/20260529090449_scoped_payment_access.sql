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
);

drop policy if exists "expenses_select_visible" on public.expenses;
create policy "expenses_select_visible" on public.expenses
for select
to authenticated
using (
  (select private.is_ownerish())
  or spent_by = (select auth.uid())
);

drop policy if exists "movements_select_visible" on public.money_movements;
create policy "movements_select_visible" on public.money_movements
for select
to authenticated
using (
  (select private.is_ownerish())
  or from_profile_id = (select auth.uid())
  or to_profile_id = (select auth.uid())
);

drop policy if exists "ledger_select_visible" on public.ledger_entries;
create policy "ledger_select_visible" on public.ledger_entries
for select
to authenticated
using (
  (select private.is_ownerish())
  or account_profile_id = (select auth.uid())
);

drop policy if exists "agent_settlements_select_visible" on public.agent_settlements;
create policy "agent_settlements_select_visible" on public.agent_settlements
for select
to authenticated
using (
  (select private.is_ownerish())
  or agent_id = (select auth.uid())
);

drop policy if exists "agent_settlements_owner_insert" on public.agent_settlements;
create policy "agent_settlements_owner_insert" on public.agent_settlements
for insert
to authenticated
with check ((select private.is_ownerish()));

drop policy if exists "agent_settlements_update_visible" on public.agent_settlements;
drop policy if exists "agent_settlements_agent_update" on public.agent_settlements;
create policy "agent_settlements_agent_update" on public.agent_settlements
for update
to authenticated
using (agent_id = (select auth.uid()))
with check (agent_id = (select auth.uid()));

create index if not exists payments_referral_agent_id_idx on public.payments (referral_agent_id);
create index if not exists agent_settlements_agent_status_idx on public.agent_settlements (agent_id, status);
