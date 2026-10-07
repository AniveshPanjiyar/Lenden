-- Paused students: inactive for now, but returning within 45 days keeps them free of the
-- admission fee. After 45 days a pause becomes a normal inactive status.

alter table public.library_students
  add column if not exists paused_at timestamptz,
  add column if not exists inactive_at timestamptz;

alter table public.course_students
  add column if not exists paused_at timestamptz,
  add column if not exists inactive_at timestamptz;

-- Existing inactive students: best known date is their last update.
update public.library_students set inactive_at = updated_at where active = false and inactive_at is null;
update public.course_students set inactive_at = updated_at where active = false and inactive_at is null;

-- Turns pauses older than 45 days into inactive (dated when the pause ran out) for the
-- business in the request. Called when the student roster loads.
create or replace function public.lenden_expire_paused_students()
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  selected_business_id uuid := private.current_business_id();
begin
  if selected_business_id is null then
    return;
  end if;

  update public.library_students
  set inactive_at = paused_at + interval '45 days',
      paused_at = null
  where business_id = selected_business_id
    and active = false
    and paused_at is not null
    and paused_at < now() - interval '45 days';

  update public.course_students
  set inactive_at = paused_at + interval '45 days',
      paused_at = null
  where business_id = selected_business_id
    and active = false
    and paused_at is not null
    and paused_at < now() - interval '45 days';
end;
$$;

revoke all on function public.lenden_expire_paused_students() from public, anon;
grant execute on function public.lenden_expire_paused_students() to authenticated;
