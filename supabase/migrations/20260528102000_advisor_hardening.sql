create schema if not exists private;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid()) and active = true;
$$;

create or replace function private.is_ownerish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(private.current_user_role() in ('admin', 'owner'), false);
$$;

create or replace function private.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(private.is_ownerish(), false)
    or exists (
      select 1
      from public.staff_permissions sp
      join public.profiles p on p.id = sp.profile_id
      where sp.profile_id = (select auth.uid())
        and p.active = true
        and sp.permission = required_permission
    );
$$;

create or replace function private.can_collect(business public.payment_business)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_ownerish()
    or private.has_permission(
      case business
        when 'guest_house' then 'collect_guest_house'
        when 'library' then 'collect_library'
        when 'course' then 'collect_course'
        when 'general' then 'collect_general'
      end
    );
$$;

grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_ownerish() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.can_collect(public.payment_business) to authenticated;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
for select to authenticated
using (private.is_ownerish() or id = (select auth.uid()) or private.current_user_role() = 'sales_agent');

drop policy if exists "profiles_owner_write" on public.profiles;
drop policy if exists "profiles_owner_insert" on public.profiles;
create policy "profiles_owner_insert" on public.profiles for insert to authenticated with check (private.is_ownerish());
drop policy if exists "profiles_owner_update" on public.profiles;
create policy "profiles_owner_update" on public.profiles for update to authenticated using (private.is_ownerish()) with check (private.is_ownerish());
drop policy if exists "profiles_owner_delete" on public.profiles;
create policy "profiles_owner_delete" on public.profiles for delete to authenticated using (private.is_ownerish());

drop policy if exists "permissions_owner_read" on public.staff_permissions;
create policy "permissions_owner_read" on public.staff_permissions
for select to authenticated
using (private.is_ownerish() or profile_id = (select auth.uid()));

drop policy if exists "permissions_owner_write" on public.staff_permissions;
drop policy if exists "permissions_owner_insert" on public.staff_permissions;
create policy "permissions_owner_insert" on public.staff_permissions for insert to authenticated with check (private.is_ownerish());
drop policy if exists "permissions_owner_update" on public.staff_permissions;
create policy "permissions_owner_update" on public.staff_permissions for update to authenticated using (private.is_ownerish()) with check (private.is_ownerish());
drop policy if exists "permissions_owner_delete" on public.staff_permissions;
create policy "permissions_owner_delete" on public.staff_permissions for delete to authenticated using (private.is_ownerish());

drop policy if exists "settings_read" on public.rooms;
create policy "settings_read" on public.rooms for select to authenticated using (true);
drop policy if exists "rooms_owner_write" on public.rooms;
drop policy if exists "rooms_owner_insert" on public.rooms;
create policy "rooms_owner_insert" on public.rooms for insert to authenticated with check (private.is_ownerish());
drop policy if exists "rooms_owner_update" on public.rooms;
create policy "rooms_owner_update" on public.rooms for update to authenticated using (private.is_ownerish()) with check (private.is_ownerish());
drop policy if exists "rooms_owner_delete" on public.rooms;
create policy "rooms_owner_delete" on public.rooms for delete to authenticated using (private.is_ownerish());

drop policy if exists "courses_read" on public.courses;
create policy "courses_read" on public.courses for select to authenticated using (true);
drop policy if exists "courses_owner_write" on public.courses;
drop policy if exists "courses_owner_insert" on public.courses;
create policy "courses_owner_insert" on public.courses for insert to authenticated with check (private.is_ownerish());
drop policy if exists "courses_owner_update" on public.courses;
create policy "courses_owner_update" on public.courses for update to authenticated using (private.is_ownerish()) with check (private.is_ownerish());
drop policy if exists "courses_owner_delete" on public.courses;
create policy "courses_owner_delete" on public.courses for delete to authenticated using (private.is_ownerish());

drop policy if exists "referral_read" on public.referral_codes;
create policy "referral_read" on public.referral_codes for select to authenticated
using (private.is_ownerish() or active = true or agent_id = (select auth.uid()));
drop policy if exists "referral_owner_write" on public.referral_codes;
drop policy if exists "referral_owner_insert" on public.referral_codes;
create policy "referral_owner_insert" on public.referral_codes for insert to authenticated with check (private.is_ownerish());
drop policy if exists "referral_owner_update" on public.referral_codes;
create policy "referral_owner_update" on public.referral_codes for update to authenticated using (private.is_ownerish()) with check (private.is_ownerish());
drop policy if exists "referral_owner_delete" on public.referral_codes;
create policy "referral_owner_delete" on public.referral_codes for delete to authenticated using (private.is_ownerish());

drop policy if exists "payments_select_visible" on public.payments;
create policy "payments_select_visible" on public.payments
for select to authenticated
using (
  private.is_ownerish()
  or collected_by = (select auth.uid())
  or current_holder_id = (select auth.uid())
  or exists (
    select 1 from public.referral_codes rc
    where rc.id = referral_code_id and rc.agent_id = (select auth.uid())
  )
);

drop policy if exists "payments_insert_allowed" on public.payments;
create policy "payments_insert_allowed" on public.payments
for insert to authenticated
with check (
  private.can_collect(business_type)
  and collected_by = (select auth.uid())
  and (current_holder_id = (select auth.uid()) or current_holder_id is null)
);

drop policy if exists "payments_update_allowed" on public.payments;
create policy "payments_update_allowed" on public.payments
for update to authenticated
using (private.is_ownerish() or (collected_by = (select auth.uid()) and approval_status <> 'approved'))
with check (private.is_ownerish() or (collected_by = (select auth.uid()) and approval_status <> 'approved'));

drop policy if exists "expenses_select_visible" on public.expenses;
create policy "expenses_select_visible" on public.expenses
for select to authenticated
using (private.is_ownerish() or spent_by = (select auth.uid()));

drop policy if exists "expenses_insert_allowed" on public.expenses;
create policy "expenses_insert_allowed" on public.expenses
for insert to authenticated
with check ((spent_by = (select auth.uid()) and private.has_permission('add_expense')) or private.is_ownerish());

drop policy if exists "expenses_update_allowed" on public.expenses;
create policy "expenses_update_allowed" on public.expenses
for update to authenticated
using (private.is_ownerish() or (spent_by = (select auth.uid()) and approval_status <> 'approved'))
with check (private.is_ownerish() or (spent_by = (select auth.uid()) and approval_status <> 'approved'));

drop policy if exists "movements_select_visible" on public.money_movements;
create policy "movements_select_visible" on public.money_movements
for select to authenticated
using (private.is_ownerish() or from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid()));

drop policy if exists "movements_insert_allowed" on public.money_movements;
create policy "movements_insert_allowed" on public.money_movements
for insert to authenticated
with check (
  private.is_ownerish()
  or (
    requested_by = (select auth.uid())
    and from_profile_id = (select auth.uid())
    and private.has_permission('transfer_money')
  )
);

drop policy if exists "movements_update_allowed" on public.money_movements;
create policy "movements_update_allowed" on public.money_movements
for update to authenticated
using (private.is_ownerish() or to_profile_id = (select auth.uid()))
with check (private.is_ownerish() or to_profile_id = (select auth.uid()));

drop policy if exists "ledger_select_visible" on public.ledger_entries;
create policy "ledger_select_visible" on public.ledger_entries
for select to authenticated
using (private.is_ownerish() or account_profile_id = (select auth.uid()));

drop policy if exists "ledger_owner_insert" on public.ledger_entries;
create policy "ledger_owner_insert" on public.ledger_entries
for insert to authenticated
with check (private.is_ownerish() or created_by = (select auth.uid()));

drop policy if exists "changes_select_visible" on public.record_change_requests;
create policy "changes_select_visible" on public.record_change_requests
for select to authenticated
using (private.is_ownerish() or requested_by = (select auth.uid()));

drop policy if exists "changes_insert_allowed" on public.record_change_requests;
create policy "changes_insert_allowed" on public.record_change_requests
for insert to authenticated
with check (requested_by = (select auth.uid()));

drop policy if exists "changes_owner_update" on public.record_change_requests;
create policy "changes_owner_update" on public.record_change_requests
for update to authenticated
using (private.is_ownerish())
with check (private.is_ownerish());

drop function if exists public.can_collect(public.payment_business);
drop function if exists public.has_permission(text);
drop function if exists public.is_ownerish();
drop function if exists public.current_user_role();

create index if not exists ledger_entries_created_by_idx on public.ledger_entries (created_by);
create index if not exists money_movements_requested_by_idx on public.money_movements (requested_by);
create index if not exists money_movements_responded_by_idx on public.money_movements (responded_by);
create index if not exists money_movements_to_profile_id_idx on public.money_movements (to_profile_id);
create index if not exists payments_course_id_idx on public.payments (course_id);
create index if not exists payments_skill_course_id_idx on public.payments (skill_course_id);
create index if not exists payments_referral_code_id_idx on public.payments (referral_code_id);
create index if not exists payments_room_id_idx on public.payments (room_id);
create index if not exists record_change_requests_requested_by_idx on public.record_change_requests (requested_by);
create index if not exists record_change_requests_reviewed_by_idx on public.record_change_requests (reviewed_by);
create index if not exists referral_codes_agent_id_idx on public.referral_codes (agent_id);
