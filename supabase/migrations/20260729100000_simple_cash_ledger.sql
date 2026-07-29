-- Simplify financial activity into four non-overlapping categories:
-- Collection, Expense, Cash Received and Cash Sent.
-- Cash transfers stay organization-scoped and never carry a business unit.

create or replace function private.lenden_backfill_cash_transfer_ledgers()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  inserted_count integer := 0;
begin
  update public.money_movements
  set business_type = null
  where business_type is not null;

  update public.ledger_entries
  set business_type = null
  where business_type is not null
    and source_type in ('transfer', 'settlement');

  delete from public.ledger_entries holder_ledger
  using public.payments payment
  where holder_ledger.business_id = payment.business_id
    and holder_ledger.source_type = 'payment'
    and holder_ledger.source_id = payment.id
    and holder_ledger.account_profile_id is distinct from payment.collected_by
    and exists (
      select 1
      from public.money_movements movement
      where movement.business_id = payment.business_id
        and movement.payment_id = payment.id
        and movement.type = 'transfer'
        and movement.status = 'accepted'
    )
    and exists (
      select 1
      from public.ledger_entries collector_ledger
      where collector_ledger.business_id = payment.business_id
        and collector_ledger.source_type = 'payment'
        and collector_ledger.source_id = payment.id
        and collector_ledger.account_profile_id = payment.collected_by
    );

  update public.ledger_entries ledger
  set account_profile_id = payment.collected_by,
      description = 'Cash collection'
  from public.payments payment
  where ledger.business_id = payment.business_id
    and ledger.source_type = 'payment'
    and ledger.source_id = payment.id
    and ledger.account_profile_id is distinct from payment.collected_by
    and exists (
      select 1
      from public.money_movements movement
      where movement.business_id = payment.business_id
        and movement.payment_id = payment.id
        and movement.type = 'transfer'
        and movement.status = 'accepted'
    );

  with accepted_movements as (
    select
      movement.*,
      case
        when movement.payment_id is null then movement.amount
        when payment.record_status = 'active'
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text) = 'approved'
          and payment.mode = 'cash'
          then payment.amount
        when payment.record_status = 'active'
          and coalesce(payment.cash_approval_status::text, payment.approval_status::text) = 'approved'
          and payment.mode = 'mixed'
          then coalesce(payment.cash_collection, 0)
        else 0
      end::numeric as cash_value,
      case
        when movement.payment_id is null
          then coalesce(movement.responded_at::date, movement.created_at::date)
        else greatest(
          coalesce(payment.cash_posted_on, payment.payment_date),
          coalesce(movement.responded_at::date, movement.created_at::date)
        )
      end as entry_date
    from public.money_movements movement
    left join public.payments payment
      on payment.business_id = movement.business_id
     and payment.id = movement.payment_id
    where movement.status = 'accepted'
  ),
  movement_flows as (
    select
      movement.business_id,
      flow.account_profile_id,
      flow.amount,
      movement.entry_date,
      movement.type::text as source_type,
      movement.id as source_id,
      flow.description,
      movement.requested_by as created_by
    from accepted_movements movement
    cross join lateral (
      values
        (movement.from_profile_id, -movement.cash_value, 'Cash sent'::text),
        (movement.to_profile_id, movement.cash_value, 'Cash received'::text)
    ) as flow(account_profile_id, amount, description)
    where movement.cash_value > 0
      and flow.account_profile_id is not null
  )
  insert into public.ledger_entries (
    business_id,
    business_type,
    account_profile_id,
    amount,
    entry_date,
    source_type,
    source_id,
    description,
    created_by
  )
  select
    flow.business_id,
    null,
    flow.account_profile_id,
    flow.amount,
    flow.entry_date,
    flow.source_type,
    flow.source_id,
    flow.description,
    flow.created_by
  from movement_flows flow
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function private.lenden_backfill_cash_transfer_ledgers() from public;

select private.lenden_backfill_cash_transfer_ledgers();

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
      public.has_business_role(
        business_id,
        array['co_owner']::public.business_role[]
      )
      and exists (
        select 1
        from public.business_memberships target
        where target.business_id = money_movements.business_id
          and target.profile_id in (
            money_movements.from_profile_id,
            money_movements.to_profile_id
          )
          and target.status = 'active'
          and target.role in ('staff', 'sales_agent')
      )
    )
  )
);

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
          and target.role in ('staff', 'sales_agent')
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
    coalesce(sum(ledger.amount) filter (
      where ledger.entry_date < p_closing_date
    ), 0),
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
    and membership.role <> 'primary_owner'
    and profile.active = true
    and profile.account_status = 'active'
    and (
      public.has_active_support_session(private.current_business_id())
      or (select viewer.role from viewer) = 'primary_owner'
      or membership.profile_id = auth.uid()
      or (
        (select viewer.role from viewer) = 'co_owner'
        and membership.role in ('staff', 'sales_agent')
      )
    )
  group by profile.id, profile.full_name, membership.role
  order by
    case when profile.id = auth.uid() then 0 else 1 end,
    profile.full_name;
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
  negative_balance_amount numeric := 0;
  negative_balance_count integer := 0;
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
      and ledger.entry_date <= p_as_of;
  end if;

  with profile_balances as (
    select
      membership.profile_id,
      membership.role,
      coalesce(sum(ledger.amount), 0)::numeric as balance
    from public.business_memberships membership
    left join public.ledger_entries ledger
      on ledger.business_id = membership.business_id
     and ledger.account_profile_id = membership.profile_id
     and ledger.entry_date <= p_as_of
    where membership.business_id = selected_business_id
      and membership.status = 'active'
      and membership.role <> 'primary_owner'
      and (
        public.has_active_support_session(selected_business_id)
        or viewer_role = 'primary_owner'
        or membership.profile_id = viewer_id
        or (
          viewer_role = 'co_owner'
          and membership.role in ('staff', 'sales_agent')
        )
      )
    group by membership.profile_id, membership.role
  )
  select
    coalesce(sum(greatest(balance, 0)) filter (
      where (
        viewer_role = 'primary_owner'
        or public.has_active_support_session(selected_business_id)
        or (
          viewer_role = 'co_owner'
          and role in ('staff', 'sales_agent')
        )
      )
    ), 0),
    coalesce(abs(sum(least(balance, 0)) filter (
      where (
        viewer_role = 'primary_owner'
        or public.has_active_support_session(selected_business_id)
        or (
          viewer_role = 'co_owner'
          and role in ('staff', 'sales_agent')
        )
      )
    )), 0),
    count(*) filter (
      where balance < 0
        and (
          viewer_role = 'primary_owner'
          or public.has_active_support_session(selected_business_id)
          or (
            viewer_role = 'co_owner'
            and role in ('staff', 'sales_agent')
          )
        )
    )
  into cash_with_staff, negative_balance_amount, negative_balance_count
  from profile_balances;

  return jsonb_build_object(
    'cashSelf', cash_self,
    'cashWithStaff', cash_with_staff,
    'negativeBalanceAmount', negative_balance_amount,
    'negativeBalanceCount', negative_balance_count
  );
end;
$$;

revoke all on function public.lenden_dashboard_cash_position(
  date, public.payment_business
) from public;
grant execute on function public.lenden_dashboard_cash_position(
  date, public.payment_business
) to authenticated;

create or replace function public.lenden_financial_activity(
  p_from date,
  p_to date,
  p_date_basis text default 'approval',
  p_business_type public.payment_business default null
)
returns table (
  activity_id text,
  source_type text,
  source_id uuid,
  lens text,
  category text,
  business_type public.payment_business,
  actor_profile_id uuid,
  flow_profile_id uuid,
  counterparty_profile_id uuid,
  cash_amount numeric,
  online_amount numeric,
  amount numeric,
  status text,
  transaction_date date,
  approval_date date,
  created_at timestamptz
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
      coalesce(payment.cash_posted_on, payment.payment_date) as approval_date,
      payment.created_at
    from public.payments payment
    where payment.business_id = private.current_business_id()
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
      coalesce(payment.online_posted_on, payment.payment_date),
      payment.created_at
    from public.payments payment
    where payment.business_id = private.current_business_id()
      and payment.record_status = 'active'
      and (p_business_type is null or payment.business_type = p_business_type)
  ),
  approved_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status = 'approved'
      and (
        case when p_date_basis = 'transaction'
          then component.transaction_date
          else component.approval_date
        end
      ) between p_from and p_to
  ),
  pending_components as (
    select *
    from payment_components component
    where component.component_amount > 0
      and component.component_status in ('pending', 'reapproval_required', 'cancel_requested')
      and component.transaction_date between p_from and p_to
  ),
  approved_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = private.current_business_id()
      and expense.record_status = 'active'
      and expense.approval_status = 'approved'
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and (
        case when p_date_basis = 'transaction'
          then expense.expense_date
          else coalesce(expense.posted_on, expense.expense_date)
        end
      ) between p_from and p_to
  ),
  pending_expenses as (
    select expense.*
    from public.expenses expense
    where expense.business_id = private.current_business_id()
      and expense.record_status = 'active'
      and expense.approval_status in ('pending', 'reapproval_required', 'cancel_requested')
      and (p_business_type is null or coalesce(expense.business_type, 'general') = p_business_type)
      and expense.expense_date between p_from and p_to
  ),
  accepted_movements as (
    select
      movement.*,
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
            coalesce(movement.responded_at::date, movement.created_at::date)
          )
        else coalesce(movement.responded_at::date, movement.created_at::date)
      end as posting_date
    from public.money_movements movement
    left join public.payments payment
      on payment.business_id = movement.business_id
     and payment.id = movement.payment_id
    where movement.business_id = private.current_business_id()
      and movement.status = 'accepted'
  ),
  movement_flows as (
    select
      movement.*,
      flow.category,
      flow.flow_profile_id,
      flow.counterparty_profile_id
    from accepted_movements movement
    cross join lateral (
      values
        ('cash_sent'::text, movement.from_profile_id, movement.to_profile_id),
        ('cash_received'::text, movement.to_profile_id, movement.from_profile_id)
    ) as flow(category, flow_profile_id, counterparty_profile_id)
    where movement.cash_value > 0
      and movement.posting_date is not null
      and flow.flow_profile_id is not null
      and (
        case when p_date_basis = 'transaction'
          then movement.created_at::date
          else movement.posting_date
        end
      ) between p_from and p_to
      and (
        public.has_active_support_session(private.current_business_id())
        or (select viewer.role from viewer) = 'primary_owner'
        or flow.flow_profile_id = auth.uid()
        or (
          (select viewer.role from viewer) = 'co_owner'
          and exists (
            select 1
            from public.business_memberships target
            where target.business_id = movement.business_id
              and target.profile_id = flow.flow_profile_id
              and target.status = 'active'
              and target.role in ('staff', 'sales_agent')
          )
        )
      )
  )
  select
    component.id::text || ':collection:' || component.component,
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
    private.current_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    component.id::text || ':pending:' || component.component,
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
    private.current_business_id(),
    component.business_type,
    component.collected_by
  )
  union all
  select
    expense.id::text || ':expense',
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
    coalesce(expense.posted_on, expense.expense_date),
    expense.created_at
  from approved_expenses expense
  where private.can_view_business_activity(
    private.current_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    expense.id::text || ':pending',
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
    private.current_business_id(),
    coalesce(expense.business_type, 'general'::public.payment_business),
    expense.spent_by
  )
  union all
  select
    movement.id::text || ':' || movement.category || ':' || movement.flow_profile_id::text,
    movement.type::text,
    movement.id,
    'personal',
    movement.category,
    null::public.payment_business,
    movement.flow_profile_id,
    movement.flow_profile_id,
    movement.counterparty_profile_id,
    movement.cash_value,
    0::numeric,
    movement.cash_value,
    'accepted',
    movement.created_at::date,
    movement.posting_date,
    movement.created_at
  from movement_flows movement;
$$;

revoke all on function public.lenden_financial_activity(
  date, date, text, public.payment_business
) from public;
grant execute on function public.lenden_financial_activity(
  date, date, text, public.payment_business
) to authenticated;

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
  cash_position jsonb;
  collection_total numeric := 0;
  collection_cash numeric := 0;
  collection_online numeric := 0;
  expense_total numeric := 0;
  expense_cash numeric := 0;
  expense_online numeric := 0;
  cash_received numeric := 0;
  cash_sent numeric := 0;
  pending_amount numeric := 0;
  pending_count integer := 0;
  opening_team_cash numeric := 0;
  closing_team_cash numeric := 0;
  expected_closing_team_cash numeric := 0;
  reconciliation jsonb := null;
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
    raise exception 'You do not have access to this business dashboard.'
      using errcode = '42501';
  end if;

  with activity as (
    select *
    from public.lenden_financial_activity(
      p_from,
      p_to,
      p_date_basis,
      p_business_type
    )
  )
  select
    coalesce(sum(amount) filter (where category = 'collection'), 0),
    coalesce(sum(cash_amount) filter (where category = 'collection'), 0),
    coalesce(sum(online_amount) filter (where category = 'collection'), 0),
    coalesce(sum(amount) filter (where category = 'expense'), 0),
    coalesce(sum(cash_amount) filter (where category = 'expense'), 0),
    coalesce(sum(online_amount) filter (where category = 'expense'), 0),
    coalesce(sum(amount) filter (
      where category = 'cash_received'
        and flow_profile_id = viewer_id
    ), 0),
    coalesce(sum(amount) filter (
      where category = 'cash_sent'
        and flow_profile_id = viewer_id
    ), 0),
    coalesce(sum(amount) filter (where category = 'pending'), 0),
    count(distinct (source_type, source_id)) filter (where category = 'pending')
  into
    collection_total,
    collection_cash,
    collection_online,
    expense_total,
    expense_cash,
    expense_online,
    cash_received,
    cash_sent,
    pending_amount,
    pending_count
  from activity;

  cash_position := public.lenden_dashboard_cash_position(p_to, null);

  if viewer_role = 'primary_owner' and p_business_type is null then
    select
      coalesce(sum(ledger.amount) filter (where ledger.entry_date < p_from), 0),
      coalesce(sum(ledger.amount) filter (where ledger.entry_date <= p_to), 0)
    into opening_team_cash, closing_team_cash
    from public.ledger_entries ledger
    join public.business_memberships membership
      on membership.business_id = ledger.business_id
     and membership.profile_id = ledger.account_profile_id
     and membership.status = 'active'
     and membership.role <> 'primary_owner'
    where ledger.business_id = selected_business_id;

    expected_closing_team_cash :=
      opening_team_cash
      + collection_cash
      - expense_cash
      + cash_sent
      - cash_received;

    reconciliation := jsonb_build_object(
      'openingTeamCash', opening_team_cash,
      'closingTeamCash', closing_team_cash,
      'expectedClosingTeamCash', expected_closing_team_cash,
      'variance', closing_team_cash - expected_closing_team_cash
    );
  end if;

  return jsonb_build_object(
    'role', viewer_role,
    'cashSelf', coalesce((cash_position ->> 'cashSelf')::numeric, 0),
    'cashWithStaff', coalesce((cash_position ->> 'cashWithStaff')::numeric, 0),
    'negativeBalanceAmount', coalesce((cash_position ->> 'negativeBalanceAmount')::numeric, 0),
    'negativeBalanceCount', coalesce((cash_position ->> 'negativeBalanceCount')::integer, 0),
    'collections', jsonb_build_object(
      'total', collection_total,
      'cash', collection_cash,
      'online', collection_online
    ),
    'expenses', jsonb_build_object(
      'total', expense_total,
      'cash', expense_cash,
      'online', expense_online
    ),
    'cashReceived', jsonb_build_object('total', cash_received),
    'cashSent', jsonb_build_object('total', cash_sent),
    'pending', jsonb_build_object(
      'amount', pending_amount,
      'count', pending_count
    ),
    'reconciliation', reconciliation,
    'businessUnits', '[]'::jsonb
  );
end;
$$;

revoke all on function public.lenden_dashboard_summary(
  date, date, text, public.payment_business
) from public;
grant execute on function public.lenden_dashboard_summary(
  date, date, text, public.payment_business
) to authenticated;
