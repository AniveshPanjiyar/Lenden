-- Dashboard redesign: pending splits so every card can show total vs approved.

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
    'personalPending', jsonb_build_object(
      'amount',
        coalesce((select sum(amount) from pending_components where collected_by = viewer_id), 0)
        + coalesce((select sum(amount) from pending_expenses where spent_by = viewer_id), 0),
      'count',
        coalesce((select count(distinct id) from pending_components where collected_by = viewer_id), 0)
        + coalesce((select count(*) from pending_expenses where spent_by = viewer_id), 0)
    ),
    'businessPending', jsonb_build_object(
      'cashIn', coalesce((select sum(amount) from pending_components where component = 'cash'), 0),
      'onlineIn', coalesce((select sum(amount) from pending_components where component = 'online'), 0),
      'cashOut', coalesce((select sum(amount) from pending_expenses where mode <> 'online'), 0),
      'onlineOut', coalesce((select sum(amount) from pending_expenses where mode = 'online'), 0)
    ),
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

-- The unit cards gain pending cash / online splits (return type changes, so recreate).
drop function if exists public.lenden_dashboard_business_status(date, date, text, public.payment_business);

create function public.lenden_dashboard_business_status(
  p_from date,
  p_to date,
  p_date_basis text default 'approval',
  p_business_type public.payment_business default null
)
returns table (
  business_type public.payment_business,
  collections numeric,
  cash_collections numeric,
  online_collections numeric,
  expenses numeric,
  cash_expenses numeric,
  online_expenses numeric,
  pending_amount numeric,
  pending_count bigint,
  pending_cash_collections numeric,
  pending_online_collections numeric,
  pending_cash_expenses numeric,
  pending_online_expenses numeric
)
language plpgsql
stable
security invoker
set search_path = public, private, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  selected_business_id uuid := private.current_business_id();
  viewer_role public.business_role;
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

  return query
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
  approved_components as (
    select component.*
    from payment_components component
    where component.amount > 0
      and component.status = 'approved'
      and (
        case
          when p_date_basis = 'transaction' then component.transaction_date
          else component.approval_date
        end
      ) between p_from and p_to
      and private.can_view_business_activity(
        selected_business_id,
        component.business_type,
        component.collected_by
      )
  ),
  approved_expenses as (
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
      and private.can_view_business_activity(
        selected_business_id,
        coalesce(expense.business_type, 'general'::public.payment_business),
        expense.spent_by
      )
  ),
  pending_component_records as (
    select component.*
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
  pending_payment_records as (
    select
      record.id,
      record.business_type,
      sum(record.amount)::numeric as amount
    from pending_component_records record
    group by record.id, record.business_type
  ),
  pending_expense_records as (
    select
      expense.id,
      coalesce(expense.business_type, 'general'::public.payment_business) as business_type,
      expense.amount::numeric as amount
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
  visible_modules as (
    select module.module
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
  select
    module.module as business_type,
    coalesce((
      select sum(component.amount)
      from approved_components component
      where component.business_type = module.module
    ), 0)::numeric as collections,
    coalesce((
      select sum(component.amount)
      from approved_components component
      where component.business_type = module.module
        and component.component = 'cash'
    ), 0)::numeric as cash_collections,
    coalesce((
      select sum(component.amount)
      from approved_components component
      where component.business_type = module.module
        and component.component = 'online'
    ), 0)::numeric as online_collections,
    coalesce((
      select sum(expense.amount)
      from approved_expenses expense
      where coalesce(expense.business_type, 'general') = module.module
    ), 0)::numeric as expenses,
    coalesce((
      select sum(expense.amount)
      from approved_expenses expense
      where coalesce(expense.business_type, 'general') = module.module
        and expense.mode <> 'online'
    ), 0)::numeric as cash_expenses,
    coalesce((
      select sum(expense.amount)
      from approved_expenses expense
      where coalesce(expense.business_type, 'general') = module.module
        and expense.mode = 'online'
    ), 0)::numeric as online_expenses,
    (
      coalesce((
        select sum(record.amount)
        from pending_payment_records record
        where record.business_type = module.module
      ), 0)
      + coalesce((
        select sum(record.amount)
        from pending_expense_records record
        where record.business_type = module.module
      ), 0)
    )::numeric as pending_amount,
    (
      coalesce((
        select count(*)
        from pending_payment_records record
        where record.business_type = module.module
      ), 0)
      + coalesce((
        select count(*)
        from pending_expense_records record
        where record.business_type = module.module
      ), 0)
    )::bigint as pending_count,
    coalesce((
      select sum(record.amount)
      from pending_component_records record
      where record.business_type = module.module
        and record.component = 'cash'
    ), 0)::numeric as pending_cash_collections,
    coalesce((
      select sum(record.amount)
      from pending_component_records record
      where record.business_type = module.module
        and record.component = 'online'
    ), 0)::numeric as pending_online_collections,
    coalesce((
      select sum(record.amount)
      from pending_expense_records record
      join public.expenses expense on expense.id = record.id
      where record.business_type = module.module
        and expense.mode <> 'online'
    ), 0)::numeric as pending_cash_expenses,
    coalesce((
      select sum(record.amount)
      from pending_expense_records record
      join public.expenses expense on expense.id = record.id
      where record.business_type = module.module
        and expense.mode = 'online'
    ), 0)::numeric as pending_online_expenses
  from visible_modules module
  order by module.module;
end;
$$;

grant execute on function public.lenden_dashboard_business_status(
  date, date, text, public.payment_business
) to authenticated;
