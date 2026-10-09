-- Transactions page: filter by record created date (business timezone) with p_date_basis = 'created'.
create or replace function public.lenden_financial_activity(
  p_from date,
  p_to date,
  p_date_basis text default 'approval'::text,
  p_business_type payment_business default null::payment_business
)
returns table(activity_id text, source_type text, source_id uuid, lens text, category text, business_type payment_business, actor_profile_id uuid, flow_profile_id uuid, counterparty_profile_id uuid, cash_amount numeric, online_amount numeric, amount numeric, status text, transaction_date date, approval_date date, created_at timestamp with time zone)
language sql
stable
set search_path to 'public', 'private', 'pg_temp'
as $function$
  with business_zone as (
    select coalesce(
      (select business.timezone from public.businesses business where business.id = private.requested_business_id()),
      'Asia/Kolkata'
    ) as tz
  ),
  payment_components as (
    select
      payment.id,
      payment.business_type,
      payment.collected_by,
      'cash'::text as component,
      case
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as component_amount,
      coalesce(payment.cash_approval_status::text, payment.approval_status::text) as component_status,
      payment.payment_date as transaction_date,
      payment.cash_posted_on as approval_date,
      payment.created_at,
      (payment.created_at at time zone zone.tz)::date as created_date
    from public.payments payment
    cross join business_zone zone
    where payment.business_id = private.requested_business_id()
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
      payment.online_posted_on,
      payment.created_at,
      (payment.created_at at time zone zone.tz)::date
    from public.payments payment
    cross join business_zone zone
    where payment.business_id = private.requested_business_id()
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
  ),
  approved_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status = 'approved'
      and (
        case p_date_basis
          when 'transaction' then component.transaction_date
          when 'created' then component.created_date
          else component.approval_date
        end
      ) between p_from and p_to
  ),
  pending_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status in ('pending', 'reapproval_required', 'cancel_requested')
      and (
        case when p_date_basis = 'created'
          then component.created_date
          else component.transaction_date
        end
      ) between p_from and p_to
  ),
  dated_expenses as (
    select expense.*, (expense.created_at at time zone zone.tz)::date as created_date
    from public.expenses expense
    cross join business_zone zone
    where expense.business_id = private.requested_business_id()
      and expense.record_status = 'active'
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
  ),
  approved_expenses as (
    select expense.*
    from dated_expenses expense
    where expense.approval_status = 'approved'
      and (
        case p_date_basis
          when 'transaction' then expense.expense_date
          when 'created' then expense.created_date
          else expense.posted_on
        end
      ) between p_from and p_to
  ),
  pending_expenses as (
    select expense.*
    from dated_expenses expense
    where expense.approval_status in ('pending', 'reapproval_required', 'cancel_requested')
      and (
        case when p_date_basis = 'created'
          then expense.created_date
          else expense.expense_date
        end
      ) between p_from and p_to
  ),
  accepted_movements as (
    select
      movement.*,
      coalesce(movement.business_type, payment.business_type) as effective_business_type,
      case
        when movement.payment_id is null then movement.amount
        when payment.mode = 'cash' then payment.amount
        when payment.mode = 'mixed' then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as cash_value,
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
      end as flow_approval_date,
      (movement.created_at at time zone coalesce(business.timezone, 'Asia/Kolkata'))::date as local_created_date
    from public.money_movements movement
    left join public.businesses business
      on business.id = movement.business_id
    left join public.payments payment
      on payment.business_id = movement.business_id
     and payment.id = movement.payment_id
    where movement.business_id = private.requested_business_id()
      and movement.status = 'accepted'
      and auth.uid() in (movement.from_profile_id, movement.to_profile_id)
      and (
        p_business_type is null
        or coalesce(movement.business_type, payment.business_type) is null
        or coalesce(movement.business_type, payment.business_type) = p_business_type
      )
  )
  select
    component.id::text || ':business:' || component.component,
    'payment'::text,
    component.id,
    'business'::text,
    'collection'::text,
    component.business_type,
    component.collected_by,
    null::uuid,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    'approved'::text,
    component.transaction_date,
    component.approval_date,
    component.created_at
  from approved_components component
  where private.can_view_business_activity(
    private.requested_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    component.id::text || ':business:pending:' || component.component,
    'payment',
    component.id,
    'business',
    'pending',
    component.business_type,
    component.collected_by,
    null::uuid,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    component.component_status,
    component.transaction_date,
    null::date,
    component.created_at
  from pending_components component
  where private.can_view_business_activity(
    private.requested_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    expense.id::text || ':business',
    'expense',
    expense.id,
    'business',
    'expense',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    null::uuid,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    'approved',
    expense.expense_date,
    expense.posted_on,
    expense.created_at
  from approved_expenses expense
  where private.can_view_business_activity(
    private.requested_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    expense.id::text || ':business:pending',
    'expense',
    expense.id,
    'business',
    'pending',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    null::uuid,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    expense.approval_status::text,
    expense.expense_date,
    null::date,
    expense.created_at
  from pending_expenses expense
  where private.can_view_business_activity(
    private.requested_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    component.id::text || ':personal:' || component.component,
    'payment',
    component.id,
    'personal',
    'in',
    component.business_type,
    component.collected_by,
    component.collected_by,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    'approved',
    component.transaction_date,
    component.approval_date,
    component.created_at
  from approved_components component
  where component.collected_by = auth.uid()
  union all
  select
    component.id::text || ':personal:pending:' || component.component,
    'payment',
    component.id,
    'personal',
    'pending',
    component.business_type,
    component.collected_by,
    component.collected_by,
    null::uuid,
    case when component.component = 'cash' then component.component_amount else 0 end,
    case when component.component = 'online' then component.component_amount else 0 end,
    component.component_amount,
    component.component_status,
    component.transaction_date,
    null::date,
    component.created_at
  from pending_components component
  where component.collected_by = auth.uid()
  union all
  select
    expense.id::text || ':personal',
    'expense',
    expense.id,
    'personal',
    'out',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    expense.spent_by,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    'approved',
    expense.expense_date,
    expense.posted_on,
    expense.created_at
  from approved_expenses expense
  where expense.spent_by = auth.uid()
  union all
  select
    expense.id::text || ':personal:pending',
    'expense',
    expense.id,
    'personal',
    'pending',
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by,
    expense.spent_by,
    null::uuid,
    case when expense.mode <> 'online' then expense.amount else 0 end,
    case when expense.mode = 'online' then expense.amount else 0 end,
    expense.amount,
    expense.approval_status::text,
    expense.expense_date,
    null::date,
    expense.created_at
  from pending_expenses expense
  where expense.spent_by = auth.uid()
  union all
  select
    movement.id::text || ':personal:' ||
      case when movement.to_profile_id = auth.uid() then 'in' else 'out' end,
    movement.type::text,
    movement.id,
    'personal',
    case when movement.to_profile_id = auth.uid() then 'in' else 'out' end,
    movement.effective_business_type,
    movement.from_profile_id,
    auth.uid(),
    case
      when movement.to_profile_id = auth.uid() then movement.from_profile_id
      else movement.to_profile_id
    end,
    movement.cash_value,
    0::numeric,
    movement.cash_value,
    'accepted',
    movement.local_created_date,
    movement.flow_approval_date,
    movement.created_at
  from accepted_movements movement
  where movement.cash_value > 0
    and movement.flow_approval_date is not null
    and (
      case when p_date_basis in ('transaction', 'created')
        then movement.local_created_date
        else movement.flow_approval_date
      end
    ) between p_from and p_to;
$function$;
