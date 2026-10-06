-- Cash in hand: the date it last stood at zero, so its IN / OUT history can be opened.

create or replace function public.lenden_dashboard_cash_position(
  p_as_of date,
  p_business_type public.payment_business default null
)
returns jsonb
language plpgsql
stable
set search_path = public, private, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  selected_business_id uuid := private.current_business_id();
  viewer_role public.business_role;
  cash_self numeric := 0;
  cash_with_staff numeric := 0;
  cash_self_pending numeric := 0;
  cash_self_since date;
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
      and (p_business_type is null or ledger.business_type is null or ledger.business_type = p_business_type);

    -- Cash the viewer collected or spent that still awaits approval (nothing posted to the ledger yet).
    select
      coalesce((
        select sum(
          case
            when payment.mode = 'cash' then payment.amount
            when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
            else 0
          end
        )
        from public.payments payment
        where payment.business_id = selected_business_id
          and payment.record_status = 'active'
          and payment.collected_by = viewer_id
          and payment.payment_date <= p_as_of
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text)
            in ('pending', 'reapproval_required', 'cancel_requested')
          and (p_business_type is null or payment.business_type = p_business_type)
          and not exists (
            select 1
            from public.ledger_entries ledger
            where ledger.business_id = payment.business_id
              and ledger.source_type = 'payment'
              and ledger.source_id = payment.id
          )
      ), 0)
      - coalesce((
        select sum(expense.amount)
        from public.expenses expense
        where expense.business_id = selected_business_id
          and expense.record_status = 'active'
          and expense.spent_by = viewer_id
          and expense.mode <> 'online'
          and expense.expense_date <= p_as_of
          and expense.approval_status in ('pending', 'reapproval_required', 'cancel_requested')
          and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
          and not exists (
            select 1
            from public.ledger_entries ledger
            where ledger.business_id = expense.business_id
              and ledger.source_type = 'expense'
              and ledger.source_id = expense.id
          )
      ), 0)
    into cash_self_pending;

    -- The day after the viewer's cash last stood at zero: every IN / OUT since then adds up to
    -- today's cash in hand. Pending cash collected earlier pulls the start back to include it.
    with daily as (
      select ledger.entry_date, sum(ledger.amount)::numeric as amount
      from public.ledger_entries ledger
      where ledger.business_id = selected_business_id
        and ledger.account_profile_id = viewer_id
        and ledger.entry_date <= p_as_of
        and (p_business_type is null or ledger.business_type is null or ledger.business_type = p_business_type)
      group by ledger.entry_date
    ),
    running as (
      select daily.entry_date, sum(daily.amount) over (order by daily.entry_date) as balance
      from daily
    ),
    last_zero as (
      select max(running.entry_date) as entry_date
      from running
      where abs(running.balance) < 0.005
    )
    select least(
      coalesce(
        (select min(daily.entry_date) from daily, last_zero
          where last_zero.entry_date is null or daily.entry_date > last_zero.entry_date),
        p_as_of
      ),
      coalesce((
        select min(payment.payment_date)
        from public.payments payment
        where payment.business_id = selected_business_id
          and payment.record_status = 'active'
          and payment.collected_by = viewer_id
          and payment.mode <> 'online'
          and payment.payment_date <= p_as_of
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text)
            in ('pending', 'reapproval_required', 'cancel_requested')
          and (p_business_type is null or payment.business_type = p_business_type)
          and not exists (
            select 1
            from public.ledger_entries ledger
            where ledger.business_id = payment.business_id
              and ledger.source_type = 'payment'
              and ledger.source_id = payment.id
          )
      ), p_as_of)
    )
    into cash_self_since;
  end if;

  if viewer_role in ('primary_owner', 'co_owner')
    or public.has_active_support_session(selected_business_id)
  then
    with visible_holders as (
      select membership.profile_id
      from public.business_memberships membership
      where membership.business_id = selected_business_id
        and membership.status = 'active'
        and (
          (
            (viewer_role = 'primary_owner' or public.has_active_support_session(selected_business_id))
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
               and assignment.staff_profile_id = membership.profile_id
              where viewer_scope.business_id = selected_business_id
                and viewer_scope.manager_profile_id = viewer_id
            )
          )
        )
    ),
    holder_cash as (
      select ledger.account_profile_id, sum(ledger.amount)::numeric as balance
      from public.ledger_entries ledger
      join visible_holders holder on holder.profile_id = ledger.account_profile_id
      where ledger.business_id = selected_business_id
        and ledger.entry_date <= p_as_of
        and (p_business_type is null or ledger.business_type is null or ledger.business_type = p_business_type)
        and (
          viewer_role is distinct from 'co_owner'
          or ledger.business_type is null
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
      group by ledger.account_profile_id
    )
    select coalesce(sum(greatest(holder.balance, 0)), 0)::numeric
    into cash_with_staff
    from holder_cash holder;
  end if;

  return jsonb_build_object(
    'cashSelf', cash_self,
    'cashWithStaff', cash_with_staff,
    'cashSelfPending', cash_self_pending,
    'cashSelfSince', cash_self_since
  );
end;
$$;
