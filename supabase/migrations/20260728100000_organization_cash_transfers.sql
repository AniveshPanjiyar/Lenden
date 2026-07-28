-- User-to-user cash transfers are organization-scoped personal movements.
-- They deliberately have no business unit, while business_id remains the
-- tenant/security boundary.

drop policy if exists ledger_select_role_scope on public.ledger_entries;
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
    or (
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and exists (
        select 1
        from public.business_memberships target
        where target.business_id = ledger_entries.business_id
          and target.profile_id = ledger_entries.account_profile_id
          and target.status = 'active'
          and (
            target.role = 'sales_agent'
            or (
              target.role = 'staff'
              and ledger_entries.business_type is null
            )
          )
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
         or ledger.business_type is null
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
       and membership.role in ('staff', 'sales_agent')
     )
   )
  where membership.business_id = private.current_business_id()
    and membership.status = 'active'
    and profile.active = true
    and profile.account_status = 'active'
    and (
      public.has_active_support_session(private.current_business_id())
      or (select viewer.role from viewer) = 'primary_owner'
      or membership.profile_id = auth.uid()
      or (
        (select viewer.role from viewer) = 'co_owner'
        and membership.role in ('co_owner', 'staff', 'sales_agent')
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

  if viewer_role in ('co_owner', 'staff', 'sales_agent') then
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
            and membership.role in ('co_owner', 'staff', 'sales_agent')
          )
          or (
            viewer_role = 'co_owner'
            and (
              membership.role = 'sales_agent'
              or (
                membership.role = 'staff'
                and (
                  ledger.business_type is null
                  or exists (
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
