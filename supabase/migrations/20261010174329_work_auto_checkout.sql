-- Anyone still checked in is checked out automatically at 7 PM (business time). A check-in made
-- after 7 PM closes at the end of that day. Runs whenever the Work page loads for the business.
alter table public.work_attendance
  add column if not exists auto_checked_out boolean not null default false;

create or replace function public.lenden_auto_checkout()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  selected_business_id uuid := private.current_business_id();
  zone text;
begin
  if selected_business_id is null then
    return;
  end if;

  select coalesce(business.timezone, 'Asia/Kolkata') into zone
  from public.businesses business
  where business.id = selected_business_id;

  update public.work_attendance attendance
  set check_out_at = cutoff.at,
      auto_checked_out = true
  from (
    select
      row.id,
      case
        when row.check_in_at < ((row.attendance_date + time '19:00') at time zone zone)
          then (row.attendance_date + time '19:00') at time zone zone
        else ((row.attendance_date + 1) + time '00:00') at time zone zone
      end as at
    from public.work_attendance row
    where row.business_id = selected_business_id
      and row.check_out_at is null
  ) cutoff
  where attendance.id = cutoff.id
    and now() >= cutoff.at;
end;
$$;

revoke all on function public.lenden_auto_checkout() from public, anon;
grant execute on function public.lenden_auto_checkout() to authenticated, service_role;
