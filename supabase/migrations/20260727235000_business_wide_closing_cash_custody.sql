-- Closing cash custody follows business membership:
-- - the Owner sees and may receive from every active Manager and Staff member;
-- - a Manager sees and may receive from every active Staff member in the same
--   business;
-- - transaction review remains business-unit scoped through
--   private.can_view_business_activity.

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
            and target.status = 'active'
            and (
              target.role = 'staff'
              or (
                target.role = 'co_owner'
                and exists (
                  select 1
                  from public.business_manager_unit_scopes viewer_scope
                  join public.business_manager_unit_scopes target_scope
                    on target_scope.business_id = viewer_scope.business_id
                   and target_scope.business_type = viewer_scope.business_type
                   and target_scope.manager_profile_id = target.profile_id
                  where viewer_scope.business_id = target_business_id
                    and viewer_scope.manager_profile_id = auth.uid()
                    and viewer_scope.business_type = target_business_type
                )
              )
            )
        )
      )
    );
$$;

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
        and membership.role in ('co_owner', 'staff')
      )
    )
  group by profile.id, profile.full_name, membership.role
  order by profile.full_name;
$$;

revoke all on function public.lenden_closing_summaries(date) from public;
grant execute on function public.lenden_closing_summaries(date) to authenticated;
