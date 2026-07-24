-- Stable subscription-cycle identity for Library and Course payments.
-- A due/partial receipt shares a key with its current subscription while every
-- renewal receives a new key.
alter table public.payments
  add column if not exists student_subscription_key text;

alter table public.library_students
  add column if not exists current_subscription_key text;

alter table public.course_students
  add column if not exists current_subscription_key text;

-- Conservative legacy backfill. Complete rows with the same tenant, student
-- identity, source, period and timing share a deterministic key. Incomplete
-- rows remain isolated so unrelated historical receipts are never merged.
update public.payments p
set student_subscription_key = case
  when p.business_type = 'library'
    and p.library_student_id is not null
    and p.start_date is not null
    and p.end_date is not null
  then 'legacy:library:student:' || md5(concat_ws(
    '|',
    p.business_id::text,
    p.library_student_id::text,
    p.start_date::text,
    p.end_date::text,
    coalesce(p.start_time::text, ''),
    coalesce(p.end_time::text, ''),
    coalesce(p.slot_hours::text, '')
  ))
  when p.business_type = 'library'
    and nullif(lower(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', '')), '') is not null
    and p.start_date is not null
    and p.end_date is not null
  then 'legacy:library:roll:' || md5(concat_ws(
    '|',
    p.business_id::text,
    lower(regexp_replace(btrim(p.roll_number), '\.0+$', '')),
    p.start_date::text,
    p.end_date::text,
    coalesce(p.start_time::text, ''),
    coalesce(p.end_time::text, ''),
    coalesce(p.slot_hours::text, '')
  ))
  when p.business_type = 'course'
    and p.course_student_id is not null
    and p.start_date is not null
    and p.end_date is not null
  then 'legacy:course:student:' || md5(concat_ws(
    '|',
    p.business_id::text,
    p.course_student_id::text,
    coalesce(p.skill_course_id::text, p.course_id::text, ''),
    p.start_date::text,
    p.end_date::text,
    coalesce(p.start_time::text, ''),
    coalesce(p.end_time::text, ''),
    coalesce(p.slot_hours::text, '')
  ))
  when p.business_type = 'course'
    and coalesce(p.skill_course_id, p.course_id) is not null
    and nullif(lower(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', '')), '') is not null
    and p.start_date is not null
    and p.end_date is not null
  then 'legacy:course:roll:' || md5(concat_ws(
    '|',
    p.business_id::text,
    coalesce(p.skill_course_id::text, p.course_id::text),
    lower(regexp_replace(btrim(p.roll_number), '\.0+$', '')),
    p.start_date::text,
    p.end_date::text,
    coalesce(p.start_time::text, ''),
    coalesce(p.end_time::text, ''),
    coalesce(p.slot_hours::text, '')
  ))
  else 'payment:' || p.id::text
end
where p.student_subscription_key is null;

update public.library_students s
set current_subscription_key = coalesce(
  (
    select p.student_subscription_key
    from public.payments p
    where p.business_id = s.business_id
      and p.id = s.last_payment_id
    limit 1
  ),
  (
    select p.student_subscription_key
    from public.payments p
    where p.business_id = s.business_id
      and p.business_type = 'library'
      and (
        p.library_student_id = s.id
        or (
          p.library_student_id is null
          and lower(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''))
            = lower(regexp_replace(btrim(coalesce(s.roll_number, '')), '\.0+$', ''))
        )
      )
    order by p.end_date desc nulls last, p.payment_date desc, p.created_at desc, p.id desc
    limit 1
  )
)
where s.current_subscription_key is null;

update public.course_students s
set current_subscription_key = coalesce(
  (
    select p.student_subscription_key
    from public.payments p
    where p.business_id = s.business_id
      and p.id = s.last_payment_id
    limit 1
  ),
  (
    select p.student_subscription_key
    from public.payments p
    where p.business_id = s.business_id
      and p.business_type = 'course'
      and p.course_student_id = s.id
    order by p.end_date desc nulls last, p.payment_date desc, p.created_at desc, p.id desc
    limit 1
  )
)
where s.current_subscription_key is null;

create index if not exists payments_business_library_subscription_date_idx
  on public.payments (
    business_id,
    library_student_id,
    student_subscription_key,
    payment_date,
    created_at
  )
  where business_type = 'library';

create index if not exists payments_business_course_subscription_date_idx
  on public.payments (
    business_id,
    course_student_id,
    student_subscription_key,
    payment_date,
    created_at
  )
  where business_type = 'course';

create index if not exists payments_business_library_roll_subscription_idx
  on public.payments (
    business_id,
    lower(regexp_replace(btrim(roll_number), '\.0+$', '')),
    student_subscription_key,
    payment_date
  )
  where business_type = 'library' and roll_number is not null;

-- Returns complete payment rows for a page of subscription cycles. The
-- function is security-invoker so payment/profile RLS continues to apply.
create or replace function public.lenden_student_subscription_history(
  p_source text,
  p_student_id uuid default null,
  p_roll_number text default null,
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  subscription_key text,
  subscription_start_date date,
  subscription_end_date date,
  subscription_start_time time,
  subscription_end_time time,
  subscription_slot_hours numeric,
  subscription_fee_amount numeric,
  subscription_sort_at timestamptz,
  transaction_count bigint,
  total_subscriptions bigint,
  total_transactions bigint,
  payment_id uuid,
  payment_amount numeric,
  payment_date date,
  payment_created_at timestamptz,
  payment_collected_by uuid,
  payment_collector_name text,
  payment_mode public.payment_mode,
  payment_cash_amount numeric,
  payment_online_amount numeric,
  payment_approval_status public.approval_status,
  payment_cash_approval_status public.approval_status,
  payment_online_approval_status public.approval_status,
  payment_record_status text,
  payment_cancel_reason text
)
language sql
stable
security invoker
set search_path = public, private, pg_temp
as $$
  with eligible as materialized (
    select
      p.*,
      coalesce(nullif(p.student_subscription_key, ''), 'payment:' || p.id::text) as effective_subscription_key
    from public.payments p
    where p.business_id = private.current_business_id()
      and (
        (
          p_source = 'library'
          and p.business_type = 'library'
          and (
            (
              p_student_id is not null
              and (
                p.library_student_id = p_student_id
                or (
                  p.library_student_id is null
                  and nullif(btrim(coalesce(p_roll_number, '')), '') is not null
                  and lower(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''))
                    = lower(regexp_replace(btrim(p_roll_number), '\.0+$', ''))
                )
              )
            )
            or (
              p_student_id is null
              and nullif(btrim(coalesce(p_roll_number, '')), '') is not null
              and lower(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''))
                = lower(regexp_replace(btrim(p_roll_number), '\.0+$', ''))
            )
          )
        )
        or (
          p_source = 'course'
          and p.business_type = 'course'
          and p_student_id is not null
          and p.course_student_id = p_student_id
        )
      )
  ),
  cycles as (
    select
      e.effective_subscription_key,
      (array_agg(e.start_date order by e.payment_date, e.created_at, e.id)
        filter (where e.start_date is not null))[1] as cycle_start_date,
      (array_agg(e.end_date order by e.payment_date, e.created_at, e.id)
        filter (where e.end_date is not null))[1] as cycle_end_date,
      (array_agg(e.start_time order by e.payment_date, e.created_at, e.id)
        filter (where e.start_time is not null))[1] as cycle_start_time,
      (array_agg(e.end_time order by e.payment_date, e.created_at, e.id)
        filter (where e.end_time is not null))[1] as cycle_end_time,
      (array_agg(e.slot_hours order by e.payment_date, e.created_at, e.id)
        filter (where e.slot_hours is not null))[1] as cycle_slot_hours,
      max(e.fee_amount) as cycle_fee_amount,
      max(e.created_at) as cycle_sort_at,
      count(*) as cycle_transaction_count
    from eligible e
    group by e.effective_subscription_key
  ),
  ranked_cycles as (
    select
      c.*,
      count(*) over () as cycle_total_subscriptions,
      sum(c.cycle_transaction_count) over () as cycle_total_transactions
    from cycles c
  ),
  paged_cycles as (
    select *
    from ranked_cycles
    order by cycle_sort_at desc, effective_subscription_key desc
    offset greatest(coalesce(p_page, 0), 0) * least(greatest(coalesce(p_page_size, 10), 1), 25)
    limit least(greatest(coalesce(p_page_size, 10), 1), 25)
  )
  select
    c.effective_subscription_key,
    c.cycle_start_date,
    c.cycle_end_date,
    c.cycle_start_time,
    c.cycle_end_time,
    c.cycle_slot_hours,
    c.cycle_fee_amount,
    c.cycle_sort_at,
    c.cycle_transaction_count,
    c.cycle_total_subscriptions,
    c.cycle_total_transactions,
    e.id,
    e.amount,
    e.payment_date,
    e.created_at,
    e.collected_by,
    pr.full_name,
    e.mode,
    case
      when e.mode = 'cash' then e.amount
      when e.mode = 'mixed' then coalesce(e.cash_collection, 0)
      else 0
    end,
    case
      when e.mode = 'online' then e.amount
      when e.mode = 'mixed' then coalesce(e.online_collection, 0)
      else 0
    end,
    e.approval_status,
    e.cash_approval_status,
    e.online_approval_status,
    e.record_status,
    e.cancel_reason
  from paged_cycles c
  join eligible e
    on e.effective_subscription_key = c.effective_subscription_key
  left join public.profiles pr
    on pr.id = e.collected_by
  order by
    c.cycle_sort_at desc,
    c.effective_subscription_key desc,
    e.payment_date asc,
    e.created_at asc,
    e.id asc;
$$;

revoke all on function public.lenden_student_subscription_history(text, uuid, text, integer, integer) from public;
grant execute on function public.lenden_student_subscription_history(text, uuid, text, integer, integer) to authenticated;

comment on column public.payments.student_subscription_key is
  'Stable cycle identity shared by initial and due/partial receipts for one student subscription.';

comment on function public.lenden_student_subscription_history(text, uuid, text, integer, integer) is
  'RLS-aware, cycle-paginated Library/Course subscription transaction history.';
