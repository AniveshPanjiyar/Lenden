delete from public.staff_permissions sp
using public.profiles p
where p.id = sp.profile_id
  and p.role = 'sales_agent';

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
        and p.role = 'staff'
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
    or (
      private.current_user_role() = 'staff'
      and private.has_permission(
        case business
          when 'guest_house' then 'collect_guest_house'
          when 'library' then 'collect_library'
          when 'course' then 'collect_course'
          when 'general' then 'collect_general'
        end
      )
    );
$$;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
for select
to authenticated
using (
  (select private.is_ownerish())
  or id = (select auth.uid())
  or (
    coalesce((select private.current_user_role()) <> 'sales_agent', false)
    and active = true
    and role in ('staff', 'sales_agent')
  )
);

drop policy if exists "permissions_owner_read" on public.staff_permissions;
create policy "permissions_owner_read" on public.staff_permissions
for select
to authenticated
using (
  (select private.is_ownerish())
  or (
    coalesce((select private.current_user_role()) <> 'sales_agent', false)
    and (
      profile_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.id = staff_permissions.profile_id
          and p.active = true
          and p.role = 'staff'
      )
    )
  )
);

drop policy if exists "permissions_owner_write" on public.staff_permissions;
drop policy if exists "permissions_owner_insert" on public.staff_permissions;
create policy "permissions_owner_insert" on public.staff_permissions
for insert
to authenticated
with check (
  (select private.is_ownerish())
  and exists (
    select 1
    from public.profiles p
    where p.id = staff_permissions.profile_id
      and p.active = true
      and p.role = 'staff'
  )
);

drop policy if exists "permissions_owner_update" on public.staff_permissions;
create policy "permissions_owner_update" on public.staff_permissions
for update
to authenticated
using ((select private.is_ownerish()))
with check (
  (select private.is_ownerish())
  and exists (
    select 1
    from public.profiles p
    where p.id = staff_permissions.profile_id
      and p.active = true
      and p.role = 'staff'
  )
);

drop policy if exists "movements_insert_allowed" on public.money_movements;
create policy "movements_insert_allowed" on public.money_movements
for insert
to authenticated
with check (
  (
    (select private.is_ownerish())
    and not exists (
      select 1
      from public.profiles p
      where p.id in (money_movements.from_profile_id, money_movements.to_profile_id)
        and p.role = 'sales_agent'
    )
  )
  or (
    requested_by = (select auth.uid())
    and from_profile_id = (select auth.uid())
    and (select private.has_permission('transfer_money'))
  )
);

drop policy if exists "movements_update_allowed" on public.money_movements;
create policy "movements_update_allowed" on public.money_movements
for update
to authenticated
using (
  (select private.is_ownerish())
  or (
    coalesce((select private.current_user_role()) <> 'sales_agent', false)
    and to_profile_id = (select auth.uid())
  )
)
with check (
  (select private.is_ownerish())
  or (
    coalesce((select private.current_user_role()) <> 'sales_agent', false)
    and to_profile_id = (select auth.uid())
  )
);

drop policy if exists "ledger_select_visible" on public.ledger_entries;
create policy "ledger_select_visible" on public.ledger_entries
for select
to authenticated
using (
  (select private.is_ownerish())
  or (
    coalesce((select private.current_user_role()) <> 'sales_agent', false)
    and account_profile_id = (select auth.uid())
  )
);

drop policy if exists "agent_settlements_update_visible" on public.agent_settlements;
drop policy if exists "agent_settlements_agent_update" on public.agent_settlements;
create policy "agent_settlements_owner_update" on public.agent_settlements
for update
to authenticated
using ((select private.is_ownerish()))
with check ((select private.is_ownerish()));
