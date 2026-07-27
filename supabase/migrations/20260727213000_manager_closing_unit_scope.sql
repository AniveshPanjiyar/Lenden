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
      or membership.profile_id = auth.uid()
      or (select viewer.role from viewer) = 'primary_owner'
      or (
        (select viewer.role from viewer) = 'co_owner'
        and membership.role = 'staff'
        and exists (
          select 1
          from public.business_staff_unit_assignments assignment
          where assignment.business_id = membership.business_id
            and assignment.manager_profile_id = auth.uid()
            and assignment.staff_profile_id = membership.profile_id
        )
      )
    )
  group by profile.id, profile.full_name, membership.role
  order by profile.full_name;
$$;

revoke all on function public.lenden_closing_summaries(date) from public;
grant execute on function public.lenden_closing_summaries(date) to authenticated;
