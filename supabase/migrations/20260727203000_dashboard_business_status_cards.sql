create or replace function public.lenden_dashboard_business_status(
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
  pending_count bigint
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
  pending_payment_records as (
    select
      component.id,
      component.business_type,
      sum(component.amount)::numeric as amount
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
    group by component.id, component.business_type
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
    )::bigint as pending_count
  from visible_modules module
  order by module.module;
end;
$$;

revoke all on function public.lenden_dashboard_business_status(
  date, date, text, public.payment_business
) from public;

grant execute on function public.lenden_dashboard_business_status(
  date, date, text, public.payment_business
) to authenticated;
