-- Pause rules and overstay dues for library and course students.
--
-- * A student who keeps coming after their subscription ended and is then paused (or marked
--   inactive) owes those days: overstay_days, from overstay_from to overstay_to. The next
--   subscription settles them (merged into it, paid, or waived by an Owner / Manager).
-- * A pause asked for while the subscription is still running waits for it to end:
--   pause_scheduled_on is the day after the end date, when the student becomes paused (and the
--   45-day pause window starts).
-- * student_status_events keeps every pause, reactivation and dues decision for the History tab.

alter table public.library_students
  add column if not exists overstay_days integer not null default 0,
  add column if not exists overstay_from date,
  add column if not exists overstay_to date,
  add column if not exists pause_scheduled_on date;

alter table public.course_students
  add column if not exists overstay_days integer not null default 0,
  add column if not exists overstay_from date,
  add column if not exists overstay_to date,
  add column if not exists pause_scheduled_on date;

create table if not exists public.student_status_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  student_type text not null check (student_type in ('library', 'course')),
  student_id uuid not null,
  event_type text not null check (event_type in (
    'pause_scheduled', 'pause_cancelled', 'paused', 'inactive', 'reactivated',
    'dues_recorded', 'dues_merged', 'dues_settled', 'dues_waived'
  )),
  event_date date not null,
  effective_date date,
  days integer,
  from_date date,
  to_date date,
  amount numeric(12, 2),
  note text,
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists student_status_events_student_idx
  on public.student_status_events (business_id, student_type, student_id, created_at desc);

alter table public.student_status_events enable row level security;
revoke all on public.student_status_events from anon;
grant select on public.student_status_events to authenticated;

-- Same access as the student rows themselves; checks run once per query, not per row.
drop policy if exists student_status_events_select_unit_scope on public.student_status_events;
create policy student_status_events_select_unit_scope on public.student_status_events
  for select to authenticated
  using (
    business_id = (select private.requested_business_id())
    and (select private.can_read_business(private.requested_business_id()))
    and (
      (select public.has_active_support_session(private.requested_business_id()))
      or (student_type = 'library' and (select private.has_business_unit_access(private.requested_business_id(), 'library'::payment_business)))
      or (student_type = 'course' and (select private.has_business_unit_access(private.requested_business_id(), 'course'::payment_business)))
    )
  );

-- Runs before student lists load: starts scheduled pauses and ends 45-day pauses.
create or replace function public.lenden_expire_paused_students()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  selected_business_id uuid := private.current_business_id();
  business_today date;
  business_zone text;
begin
  if selected_business_id is null then
    return;
  end if;
  select coalesce(nullif(timezone, ''), 'Asia/Kolkata') into business_zone
  from public.businesses where id = selected_business_id;
  business_today := (now() at time zone business_zone)::date;

  -- A new subscription that runs past the scheduled day cancels the scheduled pause.
  with renewed as (
    update public.library_students
    set pause_scheduled_on = null
    where business_id = selected_business_id
      and pause_scheduled_on is not null
      and subscription_end_date >= pause_scheduled_on
    returning id
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, note)
  select selected_business_id, 'library', id, 'pause_cancelled', business_today, 'New subscription added' from renewed;

  with renewed as (
    update public.course_students
    set pause_scheduled_on = null
    where business_id = selected_business_id
      and pause_scheduled_on is not null
      and subscription_end_date >= pause_scheduled_on
    returning id
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, note)
  select selected_business_id, 'course', id, 'pause_cancelled', business_today, 'New subscription added' from renewed;

  -- Scheduled pauses start the day after the subscription ends.
  with started as (
    update public.library_students
    set active = false,
        paused_at = (pause_scheduled_on::timestamp at time zone business_zone),
        inactive_at = null,
        pause_scheduled_on = null
    where business_id = selected_business_id
      and active
      and pause_scheduled_on is not null
      and pause_scheduled_on <= business_today
    returning id, (paused_at at time zone business_zone)::date as started_on
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, effective_date, note)
  select selected_business_id, 'library', id, 'paused', started_on, started_on, 'Scheduled pause started' from started;

  with started as (
    update public.course_students
    set active = false,
        paused_at = (pause_scheduled_on::timestamp at time zone business_zone),
        inactive_at = null,
        pause_scheduled_on = null
    where business_id = selected_business_id
      and active
      and pause_scheduled_on is not null
      and pause_scheduled_on <= business_today
    returning id, (paused_at at time zone business_zone)::date as started_on
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, effective_date, note)
  select selected_business_id, 'course', id, 'paused', started_on, started_on, 'Scheduled pause started' from started;

  -- Pauses older than 45 days become inactive.
  with ended as (
    update public.library_students
    set inactive_at = paused_at + interval '45 days',
        paused_at = null
    where business_id = selected_business_id
      and active = false
      and paused_at is not null
      and paused_at < now() - interval '45 days'
    returning id, (inactive_at at time zone business_zone)::date as ended_on
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, effective_date, note)
  select selected_business_id, 'library', id, 'inactive', ended_on, ended_on, '45-day pause ended' from ended;

  with ended as (
    update public.course_students
    set inactive_at = paused_at + interval '45 days',
        paused_at = null
    where business_id = selected_business_id
      and active = false
      and paused_at is not null
      and paused_at < now() - interval '45 days'
    returning id, (inactive_at at time zone business_zone)::date as ended_on
  )
  insert into public.student_status_events (business_id, student_type, student_id, event_type, event_date, effective_date, note)
  select selected_business_id, 'course', id, 'inactive', ended_on, ended_on, '45-day pause ended' from ended;
end;
$function$;
