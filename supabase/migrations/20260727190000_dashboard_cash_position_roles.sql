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
              from public.business_staff_unit_assignments assignment
              where assignment.business_id = selected_business_id
                and assignment.business_type = ledger.business_type
                and assignment.staff_profile_id = ledger.account_profile_id
                and assignment.manager_profile_id = viewer_id
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
