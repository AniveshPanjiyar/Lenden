-- Business Settings remains organisation-wide for Managers, while financial
-- visibility is the intersection of a Manager's units and the member's units.
-- A Staff assignment may name another Manager; the shared unit is the access
-- boundary for Closing and transaction review.

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
          from public.business_manager_unit_scopes viewer_scope
          join public.business_memberships actor
            on actor.business_id = viewer_scope.business_id
           and actor.profile_id = target_actor_profile_id
           and actor.status = 'active'
          where viewer_scope.business_id = target_business_id
            and viewer_scope.manager_profile_id = auth.uid()
            and viewer_scope.business_type = target_business_type
            and (
              actor.role = 'primary_owner'
              or actor.profile_id = auth.uid()
              or (
                actor.role = 'co_owner'
                and exists (
                  select 1
                  from public.business_manager_unit_scopes actor_scope
                  where actor_scope.business_id = target_business_id
                    and actor_scope.manager_profile_id = actor.profile_id
                    and actor_scope.business_type = target_business_type
                )
              )
              or (
                actor.role = 'staff'
                and exists (
                  select 1
                  from public.business_staff_unit_assignments assignment
                  where assignment.business_id = target_business_id
                    and assignment.staff_profile_id = actor.profile_id
                    and assignment.business_type = target_business_type
                )
              )
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
          from public.business_manager_unit_scopes viewer_scope
          join public.business_memberships target
            on target.business_id = viewer_scope.business_id
           and target.profile_id = target_staff_profile_id
           and target.status = 'active'
          where viewer_scope.business_id = target_business_id
            and viewer_scope.manager_profile_id = auth.uid()
            and viewer_scope.business_type = target_business_type
            and (
              (
                target.role = 'co_owner'
                and exists (
                  select 1
                  from public.business_manager_unit_scopes target_scope
                  where target_scope.business_id = target_business_id
                    and target_scope.manager_profile_id = target.profile_id
                    and target_scope.business_type = target_business_type
                )
              )
              or (
                target.role = 'staff'
                and exists (
                  select 1
                  from public.business_staff_unit_assignments assignment
                  where assignment.business_id = target_business_id
                    and assignment.staff_profile_id = target.profile_id
                    and assignment.business_type = target_business_type
                )
              )
            )
        )
      )
    );
$$;

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
          join public.business_manager_unit_scopes viewer_scope
            on viewer_scope.business_id = collector.business_id
           and viewer_scope.manager_profile_id = auth.uid()
           and viewer_scope.business_type = payments.business_type
          join public.business_staff_unit_assignments assignment
            on assignment.business_id = collector.business_id
           and assignment.staff_profile_id = collector.profile_id
           and assignment.business_type = payments.business_type
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
          join public.business_manager_unit_scopes viewer_scope
            on viewer_scope.business_id = spender.business_id
           and viewer_scope.manager_profile_id = auth.uid()
           and viewer_scope.business_type = coalesce(
             expenses.business_type,
             'general'::public.payment_business
           )
          join public.business_staff_unit_assignments assignment
            on assignment.business_id = spender.business_id
           and assignment.staff_profile_id = spender.profile_id
           and assignment.business_type = coalesce(
             expenses.business_type,
             'general'::public.payment_business
           )
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
      array['primary_owner']::public.business_role[]
    )
    or from_profile_id = auth.uid()
    or to_profile_id = auth.uid()
    or (
      business_type is not null
      and (
        private.can_view_staff_cash(business_id, business_type, from_profile_id)
        or private.can_view_staff_cash(business_id, business_type, to_profile_id)
      )
    )
  )
);

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
   and (
     public.has_active_support_session(private.current_business_id())
     or (select viewer.role from viewer) = 'primary_owner'
     or (
       membership.profile_id = auth.uid()
       and (
         (select viewer.role from viewer) <> 'co_owner'
         or exists (
           select 1
           from public.business_manager_unit_scopes viewer_scope
           where viewer_scope.business_id = membership.business_id
             and viewer_scope.manager_profile_id = auth.uid()
             and viewer_scope.business_type = ledger.business_type
         )
       )
     )
     or (
       (select viewer.role from viewer) = 'co_owner'
       and membership.role = 'co_owner'
       and exists (
         select 1
         from public.business_manager_unit_scopes viewer_scope
         join public.business_manager_unit_scopes target_scope
           on target_scope.business_id = viewer_scope.business_id
          and target_scope.business_type = viewer_scope.business_type
          and target_scope.manager_profile_id = membership.profile_id
         where viewer_scope.business_id = membership.business_id
           and viewer_scope.manager_profile_id = auth.uid()
           and viewer_scope.business_type = ledger.business_type
       )
     )
     or (
       (select viewer.role from viewer) = 'co_owner'
       and membership.role = 'staff'
       and exists (
         select 1
         from public.business_manager_unit_scopes viewer_scope
         join public.business_staff_unit_assignments assignment
           on assignment.business_id = viewer_scope.business_id
          and assignment.business_type = viewer_scope.business_type
          and assignment.staff_profile_id = membership.profile_id
         where viewer_scope.business_id = membership.business_id
           and viewer_scope.manager_profile_id = auth.uid()
           and viewer_scope.business_type = ledger.business_type
       )
     )
   )
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
        and membership.role = 'co_owner'
      )
      or (
        (select viewer.role from viewer) = 'co_owner'
        and membership.role = 'staff'
        and exists (
          select 1
          from public.business_manager_unit_scopes viewer_scope
          join public.business_staff_unit_assignments assignment
            on assignment.business_id = viewer_scope.business_id
           and assignment.business_type = viewer_scope.business_type
           and assignment.staff_profile_id = membership.profile_id
          where viewer_scope.business_id = membership.business_id
            and viewer_scope.manager_profile_id = auth.uid()
        )
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
            and exists (
              select 1
              from public.business_manager_unit_scopes viewer_scope
              join public.business_staff_unit_assignments assignment
                on assignment.business_id = viewer_scope.business_id
               and assignment.business_type = viewer_scope.business_type
               and assignment.staff_profile_id = ledger.account_profile_id
              where viewer_scope.business_id = selected_business_id
                and viewer_scope.manager_profile_id = viewer_id
                and viewer_scope.business_type = ledger.business_type
            )
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
