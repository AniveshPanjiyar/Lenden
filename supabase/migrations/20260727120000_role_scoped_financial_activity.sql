-- Role-scoped business activity and per-unit cash custody.
--
-- Business permissions answer "what may this member do?". These assignments
-- answer "which business activity may this member see and manage?".

alter table public.business_invitations
  add column if not exists unit_scopes public.payment_business[] not null default '{}',
  add column if not exists unit_manager_assignments jsonb not null default '{}'::jsonb;

alter table public.money_movements
  add column if not exists business_type public.payment_business;

alter table public.ledger_entries
  add column if not exists business_type public.payment_business;

create table if not exists public.business_manager_unit_scopes (
  business_id uuid not null,
  manager_profile_id uuid not null,
  business_type public.payment_business not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, manager_profile_id, business_type),
  foreign key (business_id, manager_profile_id)
    references public.business_memberships(business_id, profile_id)
    on delete cascade
);

create table if not exists public.business_staff_unit_assignments (
  business_id uuid not null,
  staff_profile_id uuid not null,
  business_type public.payment_business not null,
  manager_profile_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, staff_profile_id, business_type),
  foreign key (business_id, staff_profile_id)
    references public.business_memberships(business_id, profile_id)
    on delete cascade,
  foreign key (business_id, manager_profile_id)
    references public.business_memberships(business_id, profile_id)
    on delete set null
);

create index if not exists business_staff_unit_manager_idx
  on public.business_staff_unit_assignments (business_id, manager_profile_id, business_type);

create or replace function private.validate_business_unit_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_table_name = 'business_manager_unit_scopes' then
    if not exists (
      select 1
      from public.business_memberships bm
      where bm.business_id = new.business_id
        and bm.profile_id = new.manager_profile_id
        and bm.role = 'co_owner'
        and bm.status = 'active'
    ) then
      raise exception 'Choose an active Manager for this business unit.' using errcode = '22023';
    end if;
  else
    if not exists (
      select 1
      from public.business_memberships bm
      where bm.business_id = new.business_id
        and bm.profile_id = new.staff_profile_id
        and bm.role = 'staff'
        and bm.status = 'active'
    ) then
      raise exception 'Choose an active Staff member for this business unit.' using errcode = '22023';
    end if;
    if new.manager_profile_id is not null and not exists (
      select 1
      from public.business_memberships bm
      join public.business_manager_unit_scopes scope
        on scope.business_id = bm.business_id
       and scope.manager_profile_id = bm.profile_id
       and scope.business_type = new.business_type
      where bm.business_id = new.business_id
        and bm.profile_id = new.manager_profile_id
        and bm.role = 'co_owner'
        and bm.status = 'active'
    ) then
      raise exception 'The selected Manager is not assigned to this business unit.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_manager_unit_scope on public.business_manager_unit_scopes;
create trigger validate_manager_unit_scope
before insert or update on public.business_manager_unit_scopes
for each row execute function private.validate_business_unit_assignment();

drop trigger if exists validate_staff_unit_assignment on public.business_staff_unit_assignments;
create trigger validate_staff_unit_assignment
before insert or update on public.business_staff_unit_assignments
for each row execute function private.validate_business_unit_assignment();

-- Preserve current Manager access during rollout. Owners can narrow it later.
insert into public.business_manager_unit_scopes (
  business_id, manager_profile_id, business_type, created_by
)
select
  manager.business_id,
  manager.profile_id,
  module.module,
  owner.profile_id
from public.business_memberships manager
join public.business_modules module
  on module.business_id = manager.business_id
 and module.enabled = true
left join lateral (
  select bm.profile_id
  from public.business_memberships bm
  where bm.business_id = manager.business_id
    and bm.role = 'primary_owner'
  order by (bm.status = 'active') desc, bm.joined_at nulls last
  limit 1
) owner on true
where manager.role = 'co_owner'
  and manager.status = 'active'
on conflict (business_id, manager_profile_id, business_type) do nothing;

-- Existing Staff collection permissions become unit assignments. If a
-- business has exactly one active Manager for that unit, retain that natural
-- reporting line; otherwise leave it Owner-managed instead of guessing.
insert into public.business_staff_unit_assignments (
  business_id, staff_profile_id, business_type, manager_profile_id, created_by
)
select
  staff.business_id,
  staff.profile_id,
  permission_map.business_type,
  case when manager_count.manager_count = 1 then manager_count.manager_profile_id else null end,
  owner.profile_id
from public.business_memberships staff
join public.business_member_permissions permission
  on permission.membership_id = staff.id
join lateral (
  select case permission.permission
    when 'collect_guest_house' then 'guest_house'::public.payment_business
    when 'collect_library' then 'library'::public.payment_business
    when 'collect_course' then 'course'::public.payment_business
    when 'collect_general' then 'general'::public.payment_business
  end as business_type
) permission_map on permission_map.business_type is not null
left join lateral (
  select
    count(*)::integer as manager_count,
    min(scope.manager_profile_id::text)::uuid as manager_profile_id
  from public.business_manager_unit_scopes scope
  where scope.business_id = staff.business_id
    and scope.business_type = permission_map.business_type
) manager_count on true
left join lateral (
  select bm.profile_id
  from public.business_memberships bm
  where bm.business_id = staff.business_id
    and bm.role = 'primary_owner'
  order by (bm.status = 'active') desc, bm.joined_at nulls last
  limit 1
) owner on true
where staff.role = 'staff'
  and staff.status = 'active'
on conflict (business_id, staff_profile_id, business_type) do nothing;

update public.money_movements movement
set business_type = payment.business_type
from public.payments payment
where movement.business_type is null
  and movement.payment_id = payment.id
  and movement.business_id = payment.business_id;

update public.ledger_entries ledger
set business_type = payment.business_type
from public.payments payment
where ledger.business_type is null
  and ledger.source_type = 'payment'
  and ledger.source_id = payment.id
  and ledger.business_id = payment.business_id;

update public.ledger_entries ledger
set business_type = coalesce(expense.business_type, 'general'::public.payment_business)
from public.expenses expense
where ledger.business_type is null
  and ledger.source_type = 'expense'
  and ledger.source_id = expense.id
  and ledger.business_id = expense.business_id;

update public.ledger_entries ledger
set business_type = coalesce(movement.business_type, payment.business_type)
from public.money_movements movement
left join public.payments payment
  on payment.id = movement.payment_id
 and payment.business_id = movement.business_id
where ledger.business_type is null
  and ledger.source_type in ('transfer', 'settlement')
  and ledger.source_id = movement.id
  and ledger.business_id = movement.business_id;

create index if not exists ledger_business_unit_account_date_idx
  on public.ledger_entries (business_id, business_type, account_profile_id, entry_date desc);

create index if not exists movements_business_unit_created_idx
  on public.money_movements (business_id, business_type, created_at desc);

create or replace function private.populate_money_movement_business_type()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  source_business_type public.payment_business;
begin
  if new.payment_id is not null then
    select payment.business_type
    into source_business_type
    from public.payments payment
    where payment.id = new.payment_id
      and payment.business_id = new.business_id;

    if source_business_type is null then
      raise exception 'The transaction does not belong to the selected business.'
        using errcode = '22023';
    end if;
    if new.business_type is not null and new.business_type <> source_business_type then
      raise exception 'The transfer business unit must match the transaction.'
        using errcode = '22023';
    end if;
    new.business_type := source_business_type;
  end if;
  return new;
end;
$$;

drop trigger if exists populate_money_movement_business_type on public.money_movements;
create trigger populate_money_movement_business_type
before insert or update of payment_id, business_type on public.money_movements
for each row execute function private.populate_money_movement_business_type();

create or replace function private.validate_payment_transfer_recipient()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.type = 'transfer' and new.payment_id is not null then
    if new.to_profile_id is null or not exists (
      select 1
      from public.business_memberships membership
      join public.business_member_permissions permission
        on permission.membership_id = membership.id
      join public.business_staff_unit_assignments assignment
        on assignment.business_id = membership.business_id
       and assignment.staff_profile_id = membership.profile_id
       and assignment.business_type = new.business_type
      where membership.business_id = new.business_id
        and membership.profile_id = new.to_profile_id
        and membership.role = 'staff'
        and membership.status = 'active'
        and permission.permission = case new.business_type
          when 'guest_house' then 'collect_guest_house'
          when 'library' then 'collect_library'
          when 'course' then 'collect_course'
          when 'general' then 'collect_general'
        end
    ) then
      raise exception 'Choose an active Staff member assigned and permitted for this business unit.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_payment_transfer_recipient on public.money_movements;
create trigger validate_payment_transfer_recipient
before insert or update of payment_id, to_profile_id, business_type
on public.money_movements
for each row execute function private.validate_payment_transfer_recipient();

create or replace function private.populate_ledger_business_type()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.business_type is not null then
    return new;
  end if;

  if new.source_type = 'payment' then
    select payment.business_type
    into new.business_type
    from public.payments payment
    where payment.id = new.source_id
      and payment.business_id = new.business_id;
  elsif new.source_type = 'expense' then
    select coalesce(expense.business_type, 'general'::public.payment_business)
    into new.business_type
    from public.expenses expense
    where expense.id = new.source_id
      and expense.business_id = new.business_id;
  elsif new.source_type in ('transfer', 'settlement') then
    select coalesce(movement.business_type, payment.business_type)
    into new.business_type
    from public.money_movements movement
    left join public.payments payment
      on payment.id = movement.payment_id
     and payment.business_id = movement.business_id
    where movement.id = new.source_id
      and movement.business_id = new.business_id;
  end if;
  return new;
end;
$$;

drop trigger if exists populate_ledger_business_type on public.ledger_entries;
create trigger populate_ledger_business_type
before insert or update of source_type, source_id, business_type on public.ledger_entries
for each row execute function private.populate_ledger_business_type();

create or replace function private.manager_has_business_unit(
  target_business_id uuid,
  target_business_type public.payment_business,
  target_manager_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.business_manager_unit_scopes scope
    join public.business_memberships manager
      on manager.business_id = scope.business_id
     and manager.profile_id = scope.manager_profile_id
    where scope.business_id = target_business_id
      and scope.business_type = target_business_type
      and scope.manager_profile_id = target_manager_id
      and manager.role = 'co_owner'
      and manager.status = 'active'
  );
$$;

create or replace function private.has_business_unit_access(
  target_business_id uuid,
  target_business_type public.payment_business,
  target_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and private.module_enabled(target_business_id, target_business_type)
    and (
      public.has_active_support_session(target_business_id)
      or exists (
        select 1
        from public.business_memberships membership
        where membership.business_id = target_business_id
          and membership.profile_id = target_profile_id
          and membership.status = 'active'
          and (
            membership.role = 'primary_owner'
            or (
              membership.role = 'co_owner'
              and exists (
                select 1
                from public.business_manager_unit_scopes scope
                where scope.business_id = membership.business_id
                  and scope.manager_profile_id = membership.profile_id
                  and scope.business_type = target_business_type
              )
            )
            or (
              membership.role = 'staff'
              and exists (
                select 1
                from public.business_staff_unit_assignments assignment
                where assignment.business_id = membership.business_id
                  and assignment.staff_profile_id = membership.profile_id
                  and assignment.business_type = target_business_type
              )
            )
          )
      )
    );
$$;

create or replace function private.can_view_business_activity(
  target_business_id uuid,
  target_business_type public.payment_business,
  target_actor_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and private.manager_has_business_unit(target_business_id, target_business_type)
        and (
          target_actor_profile_id = auth.uid()
          or exists (
            select 1
            from public.business_memberships owner
            where owner.business_id = target_business_id
              and owner.profile_id = target_actor_profile_id
              and owner.role = 'primary_owner'
              and owner.status = 'active'
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments assignment
            where assignment.business_id = target_business_id
              and assignment.business_type = target_business_type
              and assignment.staff_profile_id = target_actor_profile_id
              and assignment.manager_profile_id = auth.uid()
          )
        )
      )
      or (
        public.has_business_role(
          target_business_id,
          array['staff']::public.business_role[]
        )
        and exists (
          select 1
          from public.business_staff_unit_assignments mine
          where mine.business_id = target_business_id
            and mine.business_type = target_business_type
            and mine.staff_profile_id = auth.uid()
            and (
              target_actor_profile_id = auth.uid()
              or target_actor_profile_id = mine.manager_profile_id
              or exists (
                select 1
                from public.business_memberships owner
                where owner.business_id = target_business_id
                  and owner.profile_id = target_actor_profile_id
                  and owner.role = 'primary_owner'
                  and owner.status = 'active'
              )
              or (
                mine.manager_profile_id is not null
                and exists (
                  select 1
                  from public.business_staff_unit_assignments peer
                  where peer.business_id = mine.business_id
                    and peer.business_type = mine.business_type
                    and peer.manager_profile_id = mine.manager_profile_id
                    and peer.staff_profile_id = target_actor_profile_id
                )
              )
            )
        )
      )
    );
$$;

create or replace function private.can_view_staff_cash(
  target_business_id uuid,
  target_business_type public.payment_business,
  target_staff_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or target_staff_profile_id = auth.uid()
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and exists (
          select 1
          from public.business_staff_unit_assignments assignment
          where assignment.business_id = target_business_id
            and assignment.business_type = target_business_type
            and assignment.staff_profile_id = target_staff_profile_id
            and assignment.manager_profile_id = auth.uid()
        )
      )
    );
$$;

create or replace function private.can_view_business_member(
  target_business_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or target_profile_id = auth.uid()
      or public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and (
          exists (
            select 1
            from public.business_memberships target
            where target.business_id = target_business_id
              and target.profile_id = target_profile_id
              and target.role in ('primary_owner', 'sales_agent')
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments assignment
            where assignment.business_id = target_business_id
              and assignment.staff_profile_id = target_profile_id
              and assignment.manager_profile_id = auth.uid()
          )
        )
      )
      or (
        public.has_business_role(
          target_business_id,
          array['staff']::public.business_role[]
        )
        and (
          exists (
            select 1
            from public.business_memberships target
            where target.business_id = target_business_id
              and target.profile_id = target_profile_id
              and target.role = 'primary_owner'
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments mine
            join public.business_staff_unit_assignments peer
              on peer.business_id = mine.business_id
             and peer.business_type = mine.business_type
             and peer.manager_profile_id = mine.manager_profile_id
            where mine.business_id = target_business_id
              and mine.staff_profile_id = auth.uid()
              and mine.manager_profile_id is not null
              and peer.staff_profile_id = target_profile_id
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments mine
            where mine.business_id = target_business_id
              and mine.staff_profile_id = auth.uid()
              and mine.manager_profile_id = target_profile_id
          )
        )
      )
    );
$$;

create or replace function private.can_collect_business(
  target_business_id uuid,
  target_module public.payment_business
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and private.module_enabled(target_business_id, target_module)
    and (
      public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and private.manager_has_business_unit(target_business_id, target_module)
      )
      or (
        public.has_business_role(
          target_business_id,
          array['staff']::public.business_role[]
        )
        and public.has_business_permission(
          target_business_id,
          case target_module
            when 'guest_house' then 'collect_guest_house'
            when 'library' then 'collect_library'
            when 'course' then 'collect_course'
            when 'general' then 'collect_general'
          end
        )
        and exists (
          select 1
          from public.business_staff_unit_assignments assignment
          where assignment.business_id = target_business_id
            and assignment.business_type = target_module
            and assignment.staff_profile_id = auth.uid()
        )
      )
    );
$$;

create or replace function private.can_add_expense_in_unit(
  target_business_id uuid,
  target_business_type public.payment_business
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and private.module_enabled(target_business_id, target_business_type)
    and (
      public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and private.manager_has_business_unit(target_business_id, target_business_type)
      )
      or (
        public.has_business_permission(target_business_id, 'add_expense')
        and exists (
          select 1
          from public.business_staff_unit_assignments assignment
          where assignment.business_id = target_business_id
            and assignment.business_type = target_business_type
            and assignment.staff_profile_id = auth.uid()
        )
      )
    );
$$;

create or replace function private.guard_payment_assignment_update()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if (
    new.assigned_profile_id is distinct from old.assigned_profile_id
    or new.current_holder_id is distinct from old.current_holder_id
  ) then
    if coalesce(current_setting('lenden.payment_transfer_response', true), '') <> '1' then
      raise exception 'Transaction assignment and cash custody can only change through transfer acceptance.';
    end if;
    if not exists (
      select 1
      from public.business_memberships membership
      join public.business_member_permissions permission
        on permission.membership_id = membership.id
      join public.business_staff_unit_assignments assignment
        on assignment.business_id = membership.business_id
       and assignment.staff_profile_id = membership.profile_id
       and assignment.business_type = new.business_type
      where membership.business_id = new.business_id
        and membership.profile_id = new.assigned_profile_id
        and membership.role = 'staff'
        and membership.status = 'active'
        and permission.permission = case new.business_type
          when 'guest_house' then 'collect_guest_house'
          when 'library' then 'collect_library'
          when 'course' then 'collect_course'
          when 'general' then 'collect_general'
        end
    ) then
      raise exception 'The receiving Staff member is not assigned or permitted for this business unit.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

alter table public.business_manager_unit_scopes enable row level security;
alter table public.business_staff_unit_assignments enable row level security;

drop policy if exists profiles_select_business on public.profiles;
create policy profiles_select_role_scope
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1
    from public.business_memberships target
    where target.business_id = private.requested_business_id()
      and target.profile_id = profiles.id
      and private.can_view_business_member(target.business_id, target.profile_id)
  )
);

drop policy if exists memberships_select_authorized on public.business_memberships;
create policy memberships_select_role_scope
on public.business_memberships for select to authenticated
using (
  profile_id = auth.uid()
  or public.is_platform_admin()
  or private.can_view_business_member(business_id, profile_id)
);

drop policy if exists memberships_update_managed on public.business_memberships;
create policy memberships_update_role_scope
on public.business_memberships for update to authenticated
using (
  role <> 'primary_owner'
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and (
        role = 'sales_agent'
        or (
          role = 'staff'
          and exists (
            select 1
            from public.business_staff_unit_assignments mine
            where mine.business_id = business_memberships.business_id
              and mine.staff_profile_id = business_memberships.profile_id
              and mine.manager_profile_id = auth.uid()
          )
          and not exists (
            select 1
            from public.business_staff_unit_assignments outside_team
            where outside_team.business_id = business_memberships.business_id
              and outside_team.staff_profile_id = business_memberships.profile_id
              and outside_team.manager_profile_id is distinct from auth.uid()
          )
        )
      )
    )
  )
)
with check (
  business_id = private.requested_business_id()
  and role <> 'primary_owner'
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and role in ('staff', 'sales_agent')
    )
  )
);

drop policy if exists member_permissions_select on public.business_member_permissions;
create policy member_permissions_select_role_scope
on public.business_member_permissions for select to authenticated
using (
  exists (
    select 1
    from public.business_memberships membership
    where membership.id = business_member_permissions.membership_id
      and (
        membership.profile_id = auth.uid()
        or private.can_view_business_member(
          membership.business_id,
          membership.profile_id
        )
      )
  )
);

drop policy if exists manager_unit_scopes_select on public.business_manager_unit_scopes;
create policy manager_unit_scopes_select
on public.business_manager_unit_scopes for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or manager_profile_id = auth.uid()
    or exists (
      select 1
      from public.business_staff_unit_assignments assignment
      where assignment.business_id = business_manager_unit_scopes.business_id
        and assignment.business_type = business_manager_unit_scopes.business_type
        and assignment.manager_profile_id = business_manager_unit_scopes.manager_profile_id
        and assignment.staff_profile_id = auth.uid()
    )
  )
);

drop policy if exists staff_unit_assignments_select on public.business_staff_unit_assignments;
create policy staff_unit_assignments_select
on public.business_staff_unit_assignments for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or manager_profile_id = auth.uid()
    or staff_profile_id = auth.uid()
  )
);

drop policy if exists "payments_select_visible" on public.payments;
drop policy if exists payments_select_tenant on public.payments;
create policy payments_select_role_scope
on public.payments for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or private.can_view_business_activity(business_id, business_type, collected_by)
    or assigned_profile_id = auth.uid()
    or current_holder_id = auth.uid()
    or referral_agent_id = auth.uid()
    or exists (
      select 1
      from public.money_movements movement
      where movement.business_id = payments.business_id
        and movement.payment_id = payments.id
        and movement.to_profile_id = auth.uid()
        and movement.status = 'pending'
    )
  )
);

drop policy if exists payments_insert_tenant on public.payments;
create policy payments_insert_role_scope
on public.payments for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, business_type)
  and collected_by = auth.uid()
  and assigned_profile_id = auth.uid()
  and (current_holder_id is null or current_holder_id = auth.uid())
);

drop policy if exists payments_update_tenant on public.payments;
create policy payments_update_role_scope
on public.payments for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and (
    public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and private.can_view_business_activity(business_id, business_type, collected_by)
    )
    or (assigned_profile_id = auth.uid() and approval_status <> 'approved')
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
);

drop policy if exists expenses_select_tenant on public.expenses;
create policy expenses_select_role_scope
on public.expenses for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or private.can_view_business_activity(
      business_id,
      coalesce(business_type, 'general'::public.payment_business),
      spent_by
    )
    or spent_by = auth.uid()
  )
);

drop policy if exists expenses_insert_tenant on public.expenses;
create policy expenses_insert_role_scope
on public.expenses for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and spent_by = auth.uid()
  and business_type is not null
  and private.can_add_expense_in_unit(business_id, business_type)
);

drop policy if exists expenses_update_tenant on public.expenses;
create policy expenses_update_role_scope
on public.expenses for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and (
    public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and private.can_view_business_activity(
        business_id,
        coalesce(business_type, 'general'::public.payment_business),
        spent_by
      )
    )
    or (spent_by = auth.uid() and approval_status <> 'approved')
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
);

drop policy if exists movements_select_tenant on public.money_movements;
create policy movements_select_role_scope
on public.money_movements for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or from_profile_id = auth.uid()
    or to_profile_id = auth.uid()
    or (
      business_type is not null
      and public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and private.manager_has_business_unit(business_id, business_type)
    )
  )
);

drop policy if exists movements_insert_tenant on public.money_movements;
create policy movements_insert_role_scope
on public.money_movements for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and business_type is not null
  and (
    public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      requested_by = auth.uid()
      and from_profile_id = auth.uid()
      and (
        (
          public.has_business_role(
            business_id,
            array['co_owner']::public.business_role[]
          )
          and private.manager_has_business_unit(business_id, business_type)
        )
        or (
          public.has_business_role(
            business_id,
            array['staff']::public.business_role[]
          )
          and public.has_business_permission(business_id, 'transfer_money')
          and exists (
            select 1
            from public.business_staff_unit_assignments assignment
            where assignment.business_id = money_movements.business_id
              and assignment.business_type = money_movements.business_type
              and assignment.staff_profile_id = auth.uid()
          )
        )
      )
      and (
        payment_id is null
        or exists (
          select 1
          from public.payments payment
          where payment.id = money_movements.payment_id
            and payment.business_id = money_movements.business_id
            and payment.business_type = money_movements.business_type
            and payment.assigned_profile_id = auth.uid()
            and payment.record_status = 'active'
            and payment.approval_status <> 'approved'
            and coalesce(payment.cash_approval_status::text, 'pending') <> 'approved'
            and coalesce(payment.online_approval_status::text, 'pending') <> 'approved'
        )
      )
    )
  )
);

drop policy if exists movements_update_tenant on public.money_movements;
create policy movements_update_role_scope
on public.money_movements for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and (
    public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or to_profile_id = auth.uid()
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and business_type is not null
);

drop policy if exists ledger_select_tenant on public.ledger_entries;
create policy ledger_select_role_scope
on public.ledger_entries for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner']::public.business_role[]
    )
    or account_profile_id = auth.uid()
    or (
      business_type is not null
      and private.can_view_staff_cash(business_id, business_type, account_profile_id)
    )
  )
);

drop policy if exists ledger_insert_tenant on public.ledger_entries;
create policy ledger_insert_role_scope
on public.ledger_entries for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and created_by = auth.uid()
  and public.is_business_member(business_id)
  and business_type is not null
);

drop policy if exists ledger_delete_owner on public.ledger_entries;
create policy ledger_delete_owner
on public.ledger_entries for delete to authenticated
using (
  not public.has_active_support_session(business_id)
  and business_id = private.requested_business_id()
  and public.has_business_role(
    business_id,
    array['primary_owner']::public.business_role[]
  )
);

drop policy if exists students_select_tenant on public.library_students;
create policy students_select_unit_scope
on public.library_students for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or private.has_business_unit_access(business_id, 'library')
  )
);

drop policy if exists students_insert_tenant on public.library_students;
create policy students_insert_unit_scope
on public.library_students for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
);

drop policy if exists students_update_tenant on public.library_students;
create policy students_update_unit_scope
on public.library_students for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
);

drop policy if exists student_events_select_tenant on public.library_student_subscription_events;
create policy student_events_select_unit_scope
on public.library_student_subscription_events for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or private.has_business_unit_access(business_id, 'library')
  )
);

drop policy if exists student_events_insert_tenant on public.library_student_subscription_events;
create policy student_events_insert_unit_scope
on public.library_student_subscription_events for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
);

drop policy if exists student_events_update_tenant on public.library_student_subscription_events;
create policy student_events_update_unit_scope
on public.library_student_subscription_events for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'library')
);

drop policy if exists "course_students_select_visible" on public.course_students;
create policy course_students_select_unit_scope
on public.course_students for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or private.has_business_unit_access(business_id, 'course')
  )
);

drop policy if exists "course_students_write_allowed" on public.course_students;
create policy course_students_write_unit_scope
on public.course_students for all to authenticated
using (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'course')
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'course')
);

create or replace function private.can_view_record_change_request(
  target_business_id uuid,
  target_record_type text,
  target_record_id uuid,
  target_requester_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or target_requester_id = auth.uid()
      or (
        target_record_type = 'payment'
        and exists (
          select 1
          from public.payments payment
          where payment.business_id = target_business_id
            and payment.id = target_record_id
            and private.can_view_business_activity(
              target_business_id,
              payment.business_type,
              payment.collected_by
            )
        )
      )
      or (
        target_record_type = 'expense'
        and exists (
          select 1
          from public.expenses expense
          where expense.business_id = target_business_id
            and expense.id = target_record_id
            and private.can_view_business_activity(
              target_business_id,
              coalesce(expense.business_type, 'general'::public.payment_business),
              expense.spent_by
            )
        )
      )
    );
$$;

create or replace function private.can_review_record_change_request(
  target_business_id uuid,
  target_record_type text,
  target_record_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and private.can_view_record_change_request(
          target_business_id,
          target_record_type,
          target_record_id,
          null
        )
      )
    );
$$;

drop policy if exists changes_select_tenant on public.record_change_requests;
create policy changes_select_unit_scope
on public.record_change_requests for select to authenticated
using (
  private.can_read_business(business_id)
  and private.can_view_record_change_request(
    business_id,
    record_type,
    record_id,
    requested_by
  )
);

drop policy if exists changes_insert_tenant on public.record_change_requests;
create policy changes_insert_unit_scope
on public.record_change_requests for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and requested_by = auth.uid()
  and public.is_business_member(business_id)
);

drop policy if exists changes_update_owner on public.record_change_requests;
create policy changes_update_unit_scope
on public.record_change_requests for update to authenticated
using (
  not public.has_active_support_session(business_id)
  and private.can_review_record_change_request(
    business_id,
    record_type,
    record_id
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_review_record_change_request(
    business_id,
    record_type,
    record_id
  )
);

create or replace function public.replace_business_unit_access(
  target_business_id uuid,
  target_profile_id uuid,
  target_role public.business_role,
  target_units public.payment_business[] default '{}',
  target_staff_managers jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_membership public.business_memberships%rowtype;
  target_unit public.payment_business;
  manager_id uuid;
  normalized_units public.payment_business[];
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select *
  into target_membership
  from public.business_memberships
  where business_id = target_business_id
    and profile_id = target_profile_id
  for update;

  if target_membership.id is null then
    raise exception 'Business membership was not found.' using errcode = '22023';
  end if;
  if target_membership.role is distinct from target_role then
    raise exception 'Save the business role before assigning units.' using errcode = '22023';
  end if;
  if not private.profile_can_assign_business_role(
    actor_id,
    target_business_id,
    target_role
  ) then
    raise exception 'You cannot assign business units for this member.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct unit order by unit), '{}')
  into normalized_units
  from unnest(coalesce(target_units, '{}')) unit
  where exists (
    select 1
    from public.business_modules module
    where module.business_id = target_business_id
      and module.module = unit
      and module.enabled = true
  );

  delete from public.business_manager_unit_scopes
  where business_id = target_business_id
    and manager_profile_id = target_profile_id;
  if public.has_business_role(
    target_business_id,
    array['primary_owner']::public.business_role[]
  ) or public.is_platform_admin() then
    delete from public.business_staff_unit_assignments
    where business_id = target_business_id
      and staff_profile_id = target_profile_id;
  elsif target_role = 'staff' then
    delete from public.business_staff_unit_assignments
    where business_id = target_business_id
      and staff_profile_id = target_profile_id
      and manager_profile_id = actor_id;
  else
    if exists (
      select 1
      from public.business_staff_unit_assignments assignment
      where assignment.business_id = target_business_id
        and assignment.staff_profile_id = target_profile_id
        and assignment.manager_profile_id is distinct from actor_id
    ) then
      raise exception 'Another Manager still owns one or more unit assignments for this Staff member.'
        using errcode = '42501';
    end if;
    delete from public.business_staff_unit_assignments
    where business_id = target_business_id
      and staff_profile_id = target_profile_id;
  end if;

  if target_role = 'co_owner' then
    if not public.has_business_role(
      target_business_id,
      array['primary_owner']::public.business_role[]
    ) and not public.is_platform_admin() then
      raise exception 'Only the Owner can assign Manager business units.' using errcode = '42501';
    end if;
    insert into public.business_manager_unit_scopes (
      business_id, manager_profile_id, business_type, created_by
    )
    select target_business_id, target_profile_id, unit, actor_id
    from unnest(normalized_units) unit;
  elsif target_role = 'staff' then
    foreach target_unit in array normalized_units loop
      manager_id := nullif(target_staff_managers ->> target_unit::text, '')::uuid;
      if not public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      ) and not public.is_platform_admin() then
        if manager_id is distinct from actor_id then
          raise exception 'Managers may assign Staff only to themselves in their own business units.'
            using errcode = '42501';
        end if;
        if not private.manager_has_business_unit(
          target_business_id,
          target_unit,
          actor_id
        ) then
          raise exception 'You can assign Staff only within your assigned business units.'
            using errcode = '42501';
        end if;
      end if;
      insert into public.business_staff_unit_assignments (
        business_id, staff_profile_id, business_type, manager_profile_id, created_by
      ) values (
        target_business_id, target_profile_id, target_unit, manager_id, actor_id
      );
    end loop;
  end if;

  insert into public.audit_events (
    business_id, actor_profile_id, event_type, entity_type, entity_id, after_data
  ) values (
    target_business_id,
    actor_id,
    'business_unit_access_updated',
    'business_membership',
    target_membership.id,
    jsonb_build_object(
      'role', target_role,
      'units', normalized_units,
      'staff_managers', coalesce(target_staff_managers, '{}'::jsonb)
    )
  );
end;
$$;

grant execute on function public.replace_business_unit_access(
  uuid, uuid, public.business_role, public.payment_business[], jsonb
) to authenticated;

create or replace function public.grant_business_access_scoped(
  target_business_id uuid,
  target_profile_id uuid,
  target_role public.business_role,
  target_permissions text[] default '{}',
  target_units public.payment_business[] default '{}',
  target_staff_managers jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  membership_id uuid;
begin
  membership_id := public.grant_business_access(
    target_business_id,
    target_profile_id,
    target_role,
    target_permissions
  );
  perform public.replace_business_unit_access(
    target_business_id,
    target_profile_id,
    target_role,
    target_units,
    target_staff_managers
  );
  return membership_id;
end;
$$;

grant execute on function public.grant_business_access_scoped(
  uuid, uuid, public.business_role, text[], public.payment_business[], jsonb
) to authenticated;

create or replace function private.apply_accepted_invitation_unit_access()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_unit public.payment_business;
  manager_id uuid;
begin
  if old.status is not distinct from new.status
    or new.status <> 'accepted'
    or new.accepted_by is null then
    return new;
  end if;

  delete from public.business_manager_unit_scopes
  where business_id = new.business_id
    and manager_profile_id = new.accepted_by;
  delete from public.business_staff_unit_assignments
  where business_id = new.business_id
    and staff_profile_id = new.accepted_by;

  if new.intended_role = 'co_owner' then
    insert into public.business_manager_unit_scopes (
      business_id, manager_profile_id, business_type, created_by
    )
    select new.business_id, new.accepted_by, unit, new.invited_by
    from unnest(coalesce(new.unit_scopes, '{}')) unit
    where exists (
      select 1
      from public.business_modules module
      where module.business_id = new.business_id
        and module.module = unit
        and module.enabled = true
    );
  elsif new.intended_role = 'staff' then
    foreach target_unit in array coalesce(new.unit_scopes, '{}') loop
      manager_id := nullif(new.unit_manager_assignments ->> target_unit::text, '')::uuid;
      insert into public.business_staff_unit_assignments (
        business_id, staff_profile_id, business_type, manager_profile_id, created_by
      ) values (
        new.business_id, new.accepted_by, target_unit, manager_id, new.invited_by
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_accepted_invitation_unit_access on public.business_invitations;
create trigger apply_accepted_invitation_unit_access
after update of status on public.business_invitations
for each row execute function private.apply_accepted_invitation_unit_access();

drop function if exists public.lenden_current_cash_balances();
create function public.lenden_current_cash_balances()
returns table (
  profile_id uuid,
  business_type public.payment_business,
  balance numeric
)
language sql
stable
security invoker
set search_path = public, private
as $$
  select
    ledger.account_profile_id,
    ledger.business_type,
    coalesce(sum(ledger.amount), 0)::numeric as balance
  from public.ledger_entries ledger
  where ledger.business_id = private.requested_business_id()
  group by ledger.account_profile_id, ledger.business_type
  order by ledger.account_profile_id, ledger.business_type;
$$;

grant execute on function public.lenden_current_cash_balances() to authenticated;

create or replace function public.lenden_financial_activity(
  p_from date,
  p_to date,
  p_date_basis text default 'approval',
  p_business_type public.payment_business default null
)
returns table (
  activity_id text,
  source_type text,
  source_id uuid,
  lens text,
  category text,
  business_type public.payment_business,
  actor_profile_id uuid,
  flow_profile_id uuid,
  counterparty_profile_id uuid,
  cash_amount numeric,
  online_amount numeric,
  amount numeric,
  status text,
  transaction_date date,
  approval_date date,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public, private, pg_temp
as $$
  with payment_components as (
    select
      payment.id,
      payment.business_type,
      payment.collected_by,
      'cash'::text as component,
      case
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as component_amount,
      coalesce(payment.cash_approval_status::text, payment.approval_status::text) as component_status,
      payment.payment_date as transaction_date,
      payment.cash_posted_on as approval_date,
      payment.created_at
    from public.payments payment
    where payment.business_id = private.requested_business_id()
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
    union all
    select
      payment.id,
      payment.business_type,
      payment.collected_by,
      'online'::text,
      case
        when payment.mode = 'online' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.online_collection, 0)
        else 0
      end::numeric,
      coalesce(payment.online_approval_status::text, payment.approval_status::text),
      payment.payment_date,
      payment.online_posted_on,
      payment.created_at
    from public.payments payment
    where payment.business_id = private.requested_business_id()
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
  ),
  approved_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status = 'approved'
      and (
        case when p_date_basis = 'transaction'
          then component.transaction_date
          else component.approval_date
        end
      ) between p_from and p_to
  ),
  pending_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status in ('pending', 'reapproval_required', 'cancel_requested')
      and component.transaction_date between p_from and p_to
  ),
  approved_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = private.requested_business_id()
      and expense.record_status = 'active'
      and expense.approval_status = 'approved'
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and (
        case when p_date_basis = 'transaction'
          then expense.expense_date
          else expense.posted_on
        end
      ) between p_from and p_to
  ),
  pending_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = private.requested_business_id()
      and expense.record_status = 'active'
      and expense.approval_status in ('pending', 'reapproval_required', 'cancel_requested')
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and expense.expense_date between p_from and p_to
  ),
  accepted_movements as (
    select
      movement.*,
      coalesce(movement.business_type, payment.business_type) as effective_business_type,
      case
        when movement.payment_id is null then movement.amount
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as cash_value,
      case
        when movement.payment_id is not null
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text) <> 'approved'
          then null
        when movement.payment_id is not null
          then greatest(
            coalesce(payment.cash_posted_on, payment.payment_date),
            coalesce(movement.responded_at::date, movement.created_at::date)
          )
        else coalesce(movement.responded_at::date, movement.created_at::date)
      end as flow_approval_date
    from public.money_movements movement
    left join public.payments payment
      on payment.business_id = movement.business_id
     and payment.id = movement.payment_id
    where movement.business_id = private.requested_business_id()
      and movement.status = 'accepted'
      and auth.uid() in (movement.from_profile_id, movement.to_profile_id)
      and (p_business_type is null or coalesce(movement.business_type, payment.business_type) = p_business_type)
  )
  select
    component.id::text || ':business:' || component.component,
    'payment'::text,
    component.id,
    'business'::text,
    'collection'::text,
    component.business_type,
    component.collected_by,
    null::uuid,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    'approved'::text,
    component.transaction_date,
    component.approval_date,
    component.created_at
  from approved_components component
  where private.can_view_business_activity(
    private.requested_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    component.id::text || ':business:pending:' || component.component,
    'payment',
    component.id,
    'business',
    'pending',
    component.business_type,
    component.collected_by,
    null::uuid,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    component.component_status,
    component.transaction_date,
    null::date,
    component.created_at
  from pending_components component
  where private.can_view_business_activity(
    private.requested_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    expense.id::text || ':business',
    'expense',
    expense.id,
    'business',
    'expense',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    null::uuid,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    'approved',
    expense.expense_date,
    expense.posted_on,
    expense.created_at
  from approved_expenses expense
  where private.can_view_business_activity(
    private.requested_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    expense.id::text || ':business:pending',
    'expense',
    expense.id,
    'business',
    'pending',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    null::uuid,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    expense.approval_status::text,
    expense.expense_date,
    null::date,
    expense.created_at
  from pending_expenses expense
  where private.can_view_business_activity(
    private.requested_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    component.id::text || ':personal:' || component.component,
    'payment',
    component.id,
    'personal',
    'in',
    component.business_type,
    component.collected_by,
    component.collected_by,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    'approved',
    component.transaction_date,
    component.approval_date,
    component.created_at
  from approved_components component
  where component.collected_by = auth.uid()
  union all
  select
    component.id::text || ':personal:pending:' || component.component,
    'payment',
    component.id,
    'personal',
    'pending',
    component.business_type,
    component.collected_by,
    component.collected_by,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    component.component_status,
    component.transaction_date,
    null::date,
    component.created_at
  from pending_components component
  where component.collected_by = auth.uid()
  union all
  select
    expense.id::text || ':personal',
    'expense',
    expense.id,
    'personal',
    'out',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    expense.spent_by,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    'approved',
    expense.expense_date,
    expense.posted_on,
    expense.created_at
  from approved_expenses expense
  where expense.spent_by = auth.uid()
  union all
  select
    expense.id::text || ':personal:pending',
    'expense',
    expense.id,
    'personal',
    'pending',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    expense.spent_by,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    expense.approval_status::text,
    expense.expense_date,
    null::date,
    expense.created_at
  from pending_expenses expense
  where expense.spent_by = auth.uid()
  union all
  select
    movement.id::text || ':personal:' ||
      case when movement.to_profile_id = auth.uid() then 'in' else 'out' end,
    movement.type::text,
    movement.id,
    'personal',
    case when movement.to_profile_id = auth.uid() then 'in' else 'out' end,
    movement.effective_business_type,
    movement.from_profile_id,
    auth.uid(),
    case
      when movement.to_profile_id = auth.uid() then movement.from_profile_id
      else movement.to_profile_id
    end,
    movement.cash_value,
    0::numeric,
    movement.cash_value,
    'accepted',
    movement.created_at::date,
    movement.flow_approval_date,
    movement.created_at
  from accepted_movements movement
  where movement.cash_value > 0
    and movement.flow_approval_date is not null
    and (
      case when p_date_basis = 'transaction'
        then movement.created_at::date
        else movement.flow_approval_date
      end
    ) between p_from and p_to;
$$;

grant execute on function public.lenden_financial_activity(
  date, date, text, public.payment_business
) to authenticated;

create or replace function public.lenden_dashboard_summary(
  p_from date,
  p_to date,
  p_date_basis text default 'approval',
  p_business_type public.payment_business default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, private, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  selected_business_id uuid := private.current_business_id();
  viewer_role public.business_role;
  result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid dashboard date range.' using errcode = '22023';
  end if;
  if p_date_basis not in ('approval', 'transaction') then
    raise exception 'Choose approval date or transaction date.' using errcode = '22023';
  end if;

  select membership.role
  into viewer_role
  from public.business_memberships membership
  where membership.business_id = selected_business_id
    and membership.profile_id = viewer_id
    and membership.status = 'active';

  if viewer_role is null and not public.has_active_support_session(selected_business_id) then
    raise exception 'You do not have access to this business dashboard.' using errcode = '42501';
  end if;

  with payment_components as (
    select
      payment.id,
      payment.business_type,
      payment.collected_by,
      'cash'::text as component,
      case
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as amount,
      coalesce(payment.cash_approval_status::text, payment.approval_status::text) as status,
      payment.payment_date as transaction_date,
      payment.cash_posted_on as approval_date
    from public.payments payment
    where payment.business_id = selected_business_id
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
    union all
    select
      payment.id,
      payment.business_type,
      payment.collected_by,
      'online'::text,
      case
        when payment.mode = 'online' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.online_collection, 0)
        else 0
      end::numeric,
      coalesce(payment.online_approval_status::text, payment.approval_status::text),
      payment.payment_date,
      payment.online_posted_on
    from public.payments payment
    where payment.business_id = selected_business_id
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
  ),
  ranged_components as (
    select *
    from payment_components component
    where component.amount > 0
      and component.status = 'approved'
      and (
        case
          when p_date_basis = 'transaction' then component.transaction_date
          else component.approval_date
        end
      ) between p_from and p_to
  ),
  ranged_business_components as (
    select *
    from ranged_components component
    where private.can_view_business_activity(
      selected_business_id,
      component.business_type,
      component.collected_by
    )
  ),
  ranged_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = selected_business_id
      and expense.record_status = 'active'
      and expense.approval_status = 'approved'
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and (
        case
          when p_date_basis = 'transaction' then expense.expense_date
          else expense.posted_on
        end
      ) between p_from and p_to
  ),
  ranged_business_expenses as (
    select *
    from ranged_expenses expense
    where private.can_view_business_activity(
      selected_business_id,
      coalesce(expense.business_type, 'general'::public.payment_business),
      expense.spent_by
    )
  ),
  accepted_movements as (
    select
      movement.*,
      coalesce(
        movement.business_type,
        payment.business_type
      ) as effective_business_type,
      case
        when movement.payment_id is null then movement.amount
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as cash_amount,
      case
        when movement.payment_id is not null
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text) <> 'approved'
          then null
        when movement.payment_id is not null
          then greatest(
            coalesce(payment.cash_posted_on, payment.payment_date),
            coalesce(movement.responded_at::date, movement.created_at::date)
          )
        else coalesce(movement.responded_at::date, movement.created_at::date)
      end as posting_date
    from public.money_movements movement
    left join public.payments payment
      on payment.id = movement.payment_id
     and payment.business_id = movement.business_id
    where movement.business_id = selected_business_id
      and movement.status = 'accepted'
      and (p_business_type is null or coalesce(movement.business_type, payment.business_type) = p_business_type)
  ),
  pending_components as (
    select *
    from payment_components component
    where component.amount > 0
      and component.status in ('pending', 'reapproval_required', 'cancel_requested')
      and component.transaction_date between p_from and p_to
      and (
        (viewer_role = 'staff' and component.collected_by = viewer_id)
        or (
          viewer_role is distinct from 'staff'
          and private.can_view_business_activity(
            selected_business_id,
            component.business_type,
            component.collected_by
          )
        )
      )
  ),
  pending_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = selected_business_id
      and expense.record_status = 'active'
      and expense.approval_status in ('pending', 'reapproval_required', 'cancel_requested')
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and expense.expense_date between p_from and p_to
      and (
        (viewer_role = 'staff' and expense.spent_by = viewer_id)
        or (
          viewer_role is distinct from 'staff'
          and private.can_view_business_activity(
            selected_business_id,
            coalesce(expense.business_type, 'general'::public.payment_business),
            expense.spent_by
          )
        )
      )
  ),
  staff_balances as (
    select
      ledger.account_profile_id,
      ledger.business_type,
      sum(ledger.amount)::numeric as balance
    from public.ledger_entries ledger
    join public.business_memberships membership
      on membership.business_id = ledger.business_id
     and membership.profile_id = ledger.account_profile_id
     and membership.role = 'staff'
     and membership.status = 'active'
    where ledger.business_id = selected_business_id
      and ledger.entry_date <= p_to
      and (p_business_type is null or ledger.business_type = p_business_type)
    group by ledger.account_profile_id, ledger.business_type
  ),
  business_units as (
    select
      module.module as business_type,
      coalesce((
        select sum(component.amount)
        from ranged_business_components component
        where component.business_type = module.module
      ), 0)::numeric as collections,
      coalesce((
        select sum(component.amount)
        from ranged_business_components component
        where component.business_type = module.module
          and component.component = 'cash'
      ), 0)::numeric as cash_collections,
      coalesce((
        select sum(component.amount)
        from ranged_business_components component
        where component.business_type = module.module
          and component.component = 'online'
      ), 0)::numeric as online_collections,
      coalesce((
        select sum(expense.amount)
        from ranged_business_expenses expense
        where coalesce(expense.business_type, 'general') = module.module
      ), 0)::numeric as expenses
    from public.business_modules module
    where module.business_id = selected_business_id
      and module.enabled = true
      and (p_business_type is null or module.module = p_business_type)
      and (
        viewer_role = 'primary_owner'
        or public.has_active_support_session(selected_business_id)
        or (
          viewer_role = 'co_owner'
          and exists (
            select 1
            from public.business_manager_unit_scopes scope
            where scope.business_id = selected_business_id
              and scope.manager_profile_id = viewer_id
              and scope.business_type = module.module
          )
        )
        or (
          viewer_role = 'staff'
          and exists (
            select 1
            from public.business_staff_unit_assignments assignment
            where assignment.business_id = selected_business_id
              and assignment.staff_profile_id = viewer_id
              and assignment.business_type = module.module
          )
        )
      )
  )
  select jsonb_build_object(
    'role', viewer_role,
    'cashSelf', coalesce((
      select sum(ledger.amount)
      from public.ledger_entries ledger
      where ledger.business_id = selected_business_id
        and ledger.account_profile_id = viewer_id
        and ledger.entry_date <= p_to
        and (p_business_type is null or ledger.business_type = p_business_type)
    ), 0),
    'cashWithStaff', coalesce((
      select sum(greatest(balance, 0))
      from staff_balances
    ), 0),
    'collections', jsonb_build_object(
      'total', coalesce((select sum(amount) from ranged_business_components), 0),
      'cash', coalesce((select sum(amount) from ranged_business_components where component = 'cash'), 0),
      'online', coalesce((select sum(amount) from ranged_business_components where component = 'online'), 0)
    ),
    'expenses', jsonb_build_object(
      'total', coalesce((select sum(amount) from ranged_business_expenses), 0),
      'cash', coalesce((select sum(amount) from ranged_business_expenses where mode <> 'online'), 0),
      'online', coalesce((select sum(amount) from ranged_business_expenses where mode = 'online'), 0)
    ),
    'personalIn', jsonb_build_object(
      'total',
        coalesce((select sum(amount) from ranged_components where collected_by = viewer_id), 0)
        + coalesce((
          select sum(cash_amount)
          from accepted_movements
          where to_profile_id = viewer_id
            and cash_amount > 0
            and posting_date between p_from and p_to
        ), 0),
      'cash',
        coalesce((select sum(amount) from ranged_components where collected_by = viewer_id and component = 'cash'), 0)
        + coalesce((
          select sum(cash_amount)
          from accepted_movements
          where to_profile_id = viewer_id
            and cash_amount > 0
            and posting_date between p_from and p_to
        ), 0),
      'online',
        coalesce((select sum(amount) from ranged_components where collected_by = viewer_id and component = 'online'), 0)
    ),
    'personalOut', jsonb_build_object(
      'total',
        coalesce((select sum(amount) from ranged_expenses where spent_by = viewer_id), 0)
        + coalesce((
          select sum(cash_amount)
          from accepted_movements
          where from_profile_id = viewer_id
            and cash_amount > 0
            and posting_date between p_from and p_to
        ), 0),
      'cash',
        coalesce((select sum(amount) from ranged_expenses where spent_by = viewer_id and mode <> 'online'), 0)
        + coalesce((
          select sum(cash_amount)
          from accepted_movements
          where from_profile_id = viewer_id
            and cash_amount > 0
            and posting_date between p_from and p_to
        ), 0),
      'online',
        coalesce((select sum(amount) from ranged_expenses where spent_by = viewer_id and mode = 'online'), 0)
    ),
    'pending', jsonb_build_object(
      'amount',
        coalesce((select sum(amount) from pending_components), 0)
        + coalesce((select sum(amount) from pending_expenses), 0),
      'count',
        coalesce((select count(distinct id) from pending_components), 0)
        + coalesce((select count(*) from pending_expenses), 0)
    ),
    'businessUnits', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'businessType', business_type,
          'collections', collections,
          'cashCollections', cash_collections,
          'onlineCollections', online_collections,
          'expenses', expenses
        )
        order by business_type
      )
      from business_units
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

grant execute on function public.lenden_dashboard_summary(
  date, date, text, public.payment_business
) to authenticated;
