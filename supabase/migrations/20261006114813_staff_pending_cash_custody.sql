-- Staff see the cash they hold including records still awaiting approval, and the
-- personal flow can split cash IN/OUT into total vs approved.

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
    'cashSelfPending', cash_self_pending
  );
end;
$$;

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
            (coalesce(movement.responded_at, movement.created_at) at time zone coalesce(business.timezone, 'Asia/Kolkata'))::date
          )
        else coalesce(
          (
            select min(ledger.entry_date)
            from public.ledger_entries ledger
            where ledger.business_id = movement.business_id
              and ledger.source_type = movement.type::text
              and ledger.source_id = movement.id
          ),
          (coalesce(movement.responded_at, movement.created_at) at time zone coalesce(business.timezone, 'Asia/Kolkata'))::date
        )
      end as posting_date
    from public.money_movements movement
    left join public.businesses business
      on business.id = movement.business_id
    left join public.payments payment
      on payment.id = movement.payment_id
     and payment.business_id = movement.business_id
    where movement.business_id = selected_business_id
      and movement.status = 'accepted'
      and (
        p_business_type is null
        or coalesce(movement.business_type, payment.business_type) is null
        or coalesce(movement.business_type, payment.business_type) = p_business_type
      )
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
      sum(ledger.amount)::numeric as balance
    from public.ledger_entries ledger
    join public.business_memberships membership
      on membership.business_id = ledger.business_id
     and membership.profile_id = ledger.account_profile_id
     and membership.role = 'staff'
     and membership.status = 'active'
    where ledger.business_id = selected_business_id
      and ledger.entry_date <= p_to
      and (p_business_type is null or ledger.business_type is null or ledger.business_type = p_business_type)
    group by ledger.account_profile_id
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
        and (p_business_type is null or ledger.business_type is null or ledger.business_type = p_business_type)
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
    'personalCashPending', coalesce((
      select sum(amount) from pending_components where collected_by = viewer_id and component = 'cash'
    ), 0),
    'personalCashOutPending', coalesce((
      select sum(amount) from pending_expenses where spent_by = viewer_id and mode <> 'online'
    ), 0),
    'personalOnlinePending', coalesce((
      select sum(amount) from pending_components where collected_by = viewer_id and component = 'online'
    ), 0),
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
