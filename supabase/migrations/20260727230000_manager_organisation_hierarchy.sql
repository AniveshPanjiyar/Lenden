-- Managers sit between the Owner and Staff:
-- - every Manager can see the business directory and Closing for all Managers
--   and Staff;
-- - Managers may manage Staff access and approve Staff records;
-- - Managers receive Staff cash, while the Owner receives Manager cash.

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
        array['primary_owner', 'co_owner']::public.business_role[]
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
        and exists (
          select 1
          from public.business_memberships actor
          where actor.business_id = target_business_id
            and actor.profile_id = target_actor_profile_id
            and actor.role in ('primary_owner', 'co_owner', 'staff')
            and actor.status = 'active'
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
          from public.business_memberships target
          where target.business_id = target_business_id
            and target.profile_id = target_staff_profile_id
            and target.role in ('co_owner', 'staff')
            and target.status = 'active'
        )
      )
    );
$$;

drop policy if exists memberships_update_role_scope on public.business_memberships;
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
      and role in ('staff', 'sales_agent')
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

drop policy if exists manager_unit_scopes_select on public.business_manager_unit_scopes;
create policy manager_unit_scopes_select
on public.business_manager_unit_scopes for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner', 'co_owner']::public.business_role[]
    )
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
      array['primary_owner', 'co_owner']::public.business_role[]
    )
    or staff_profile_id = auth.uid()
  )
);

drop policy if exists payments_update_role_scope on public.payments;
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
      and (
        collected_by = auth.uid()
        or exists (
          select 1
          from public.business_memberships collector
          where collector.business_id = payments.business_id
            and collector.profile_id = payments.collected_by
            and collector.role = 'staff'
            and collector.status = 'active'
        )
      )
    )
    or (assigned_profile_id = auth.uid() and approval_status <> 'approved')
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
);

drop policy if exists expenses_update_role_scope on public.expenses;
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
      and (
        spent_by = auth.uid()
        or exists (
          select 1
          from public.business_memberships spender
          where spender.business_id = expenses.business_id
            and spender.profile_id = expenses.spent_by
            and spender.role = 'staff'
            and spender.status = 'active'
        )
      )
    )
    or (spent_by = auth.uid() and approval_status <> 'approved')
  )
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
);

drop policy if exists movements_select_role_scope on public.money_movements;
create policy movements_select_role_scope
on public.money_movements for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(
      business_id,
      array['primary_owner', 'co_owner']::public.business_role[]
    )
    or from_profile_id = auth.uid()
    or to_profile_id = auth.uid()
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
  actor_is_owner boolean;
  actor_is_platform_admin boolean;
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

  actor_is_owner := public.has_business_role(
    target_business_id,
    array['primary_owner']::public.business_role[]
  );
  select exists (
    select 1
    from public.profiles profile
    where profile.id = actor_id
      and profile.platform_role = 'platform_admin'
      and profile.active = true
      and profile.account_status = 'active'
  ) into actor_is_platform_admin;

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

  delete from public.business_staff_unit_assignments
  where business_id = target_business_id
    and staff_profile_id = target_profile_id;

  if target_role = 'co_owner' then
    if not actor_is_owner and not actor_is_platform_admin then
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
      if not actor_is_owner and not actor_is_platform_admin then
        if manager_id is null then
          manager_id := actor_id;
        end if;
        if not private.manager_has_business_unit(
          target_business_id,
          target_unit,
          manager_id
        ) then
          raise exception 'Choose an active Manager assigned to this business unit.'
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

create or replace function public.lenden_closing_summaries(p_closing_date date)
returns table (
  profile_id uuid,
  full_name text,
  role public.app_role,
  opening numeric,
  collected numeric,
  expenses numeric,
  received numeric,
  sent numeric,
  adjustments numeric,
  closing numeric
)
language sql
stable
security invoker
set search_path = public, private, pg_temp
as $$
  with viewer as (
    select membership.role
    from public.business_memberships membership
    where membership.business_id = private.current_business_id()
      and membership.profile_id = auth.uid()
      and membership.status = 'active'
  )
  select
    profile.id,
    profile.full_name,
    (case membership.role
      when 'primary_owner' then 'admin'
      when 'co_owner' then 'owner'
      when 'sales_agent' then 'sales_agent'
      else 'staff'
    end)::public.app_role,
    coalesce(sum(ledger.amount) filter (where ledger.entry_date < p_closing_date), 0),
    coalesce(sum(ledger.amount) filter (
      where ledger.entry_date = p_closing_date
        and ledger.source_type = 'payment'
        and ledger.amount > 0
    ), 0),
    coalesce(abs(sum(ledger.amount) filter (
      where ledger.entry_date = p_closing_date
        and ledger.source_type = 'expense'
        and ledger.amount < 0
    )), 0),
    coalesce(sum(ledger.amount) filter (
      where ledger.entry_date = p_closing_date
        and ledger.source_type in ('transfer', 'settlement')
        and ledger.amount > 0
    ), 0),
    coalesce(abs(sum(ledger.amount) filter (
      where ledger.entry_date = p_closing_date
        and ledger.source_type in ('transfer', 'settlement')
        and ledger.amount < 0
    )), 0),
    coalesce(sum(ledger.amount) filter (
      where ledger.entry_date = p_closing_date
        and ledger.source_type = 'adjustment'
    ), 0),
    coalesce(sum(ledger.amount), 0)
  from public.business_memberships membership
  join public.profiles profile
    on profile.id = membership.profile_id
  left join public.ledger_entries ledger
    on ledger.business_id = membership.business_id
   and ledger.account_profile_id = membership.profile_id
   and ledger.entry_date <= p_closing_date
  where membership.business_id = private.current_business_id()
    and membership.status = 'active'
    and membership.role <> 'sales_agent'
    and profile.active = true
    and profile.account_status = 'active'
    and (
      public.has_active_support_session(private.current_business_id())
      or (select viewer.role from viewer) = 'primary_owner'
      or membership.profile_id = auth.uid()
      or (
        (select viewer.role from viewer) = 'co_owner'
        and membership.role in ('co_owner', 'staff')
      )
    )
  group by profile.id, profile.full_name, membership.role
  order by profile.full_name;
$$;

revoke all on function public.lenden_closing_summaries(date) from public;
grant execute on function public.lenden_closing_summaries(date) to authenticated;

create or replace function public.lenden_dashboard_cash_position(
  p_as_of date,
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
  cash_self numeric := 0;
  cash_with_staff numeric := 0;
begin
  if p_as_of is null then
    raise exception 'Choose a valid cash balance date.' using errcode = '22023';
  end if;

  select membership.role
  into viewer_role
  from public.business_memberships membership
  where membership.business_id = selected_business_id
    and membership.profile_id = viewer_id
    and membership.status = 'active';

  if viewer_role is null and not public.has_active_support_session(selected_business_id) then
    raise exception 'You do not have access to this business cash position.'
      using errcode = '42501';
  end if;

  if viewer_role in ('co_owner', 'staff') then
    select coalesce(sum(ledger.amount), 0)::numeric
    into cash_self
    from public.ledger_entries ledger
    where ledger.business_id = selected_business_id
      and ledger.account_profile_id = viewer_id
      and ledger.entry_date <= p_as_of
      and (p_business_type is null or ledger.business_type = p_business_type);
  end if;

  if viewer_role in ('primary_owner', 'co_owner')
    or public.has_active_support_session(selected_business_id)
  then
    with cash_buckets as (
      select
        ledger.account_profile_id,
        ledger.business_type,
        membership.role,
        sum(ledger.amount)::numeric as balance
      from public.ledger_entries ledger
      join public.business_memberships membership
        on membership.business_id = ledger.business_id
       and membership.profile_id = ledger.account_profile_id
       and membership.status = 'active'
      where ledger.business_id = selected_business_id
        and ledger.entry_date <= p_as_of
        and (p_business_type is null or ledger.business_type = p_business_type)
        and (
          (
            (
              viewer_role = 'primary_owner'
              or public.has_active_support_session(selected_business_id)
            )
            and membership.role in ('co_owner', 'staff')
          )
          or (
            viewer_role = 'co_owner'
            and membership.role = 'staff'
          )
        )
      group by ledger.account_profile_id, ledger.business_type, membership.role
    )
    select coalesce(sum(greatest(bucket.balance, 0)), 0)::numeric
    into cash_with_staff
    from cash_buckets bucket;
  end if;

  return jsonb_build_object(
    'cashSelf', cash_self,
    'cashWithStaff', cash_with_staff
  );
end;
$$;

revoke all on function public.lenden_dashboard_cash_position(
  date, public.payment_business
) from public;

grant execute on function public.lenden_dashboard_cash_position(
  date, public.payment_business
) to authenticated;
