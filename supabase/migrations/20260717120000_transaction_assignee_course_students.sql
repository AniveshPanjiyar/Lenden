-- Separate operational transaction assignment from physical cash custody and
-- persist course students independently from payment history.

alter table public.payments
  add column if not exists assigned_profile_id uuid,
  add column if not exists course_student_id uuid;

update public.payments
set assigned_profile_id = coalesce(current_holder_id, collected_by)
where assigned_profile_id is null;

alter table public.payments
  alter column assigned_profile_id set default auth.uid(),
  alter column assigned_profile_id set not null;

alter table public.payments
  drop constraint if exists payments_business_assigned_profile_fkey;

alter table public.payments
  add constraint payments_business_assigned_profile_fkey
  foreign key (business_id, assigned_profile_id)
  references public.business_memberships (business_id, profile_id)
  on delete restrict;

create index if not exists payments_business_assignee_date_idx
  on public.payments (business_id, assigned_profile_id, payment_date desc);

create index if not exists payments_business_assignee_status_idx
  on public.payments (business_id, assigned_profile_id, approval_status, created_at desc)
  where record_status = 'active';

create table if not exists public.course_students (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.current_business_id()
    references public.businesses(id) on delete restrict,
  source_course_id uuid not null,
  identity_key text not null,
  roll_number text,
  student_name text,
  aadhar_photo_url text,
  aadhar_back_photo_url text,
  subscription_start_date date,
  subscription_end_date date,
  start_time time,
  end_time time,
  slot_hours numeric(5,2),
  fee_amount numeric(12,2),
  paid_amount numeric(12,2),
  dues_amount numeric(12,2),
  advance_amount numeric(12,2),
  active boolean not null default true,
  last_payment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_students_business_identity_key unique (business_id, source_course_id, identity_key),
  constraint course_students_identity_present check (char_length(btrim(identity_key)) > 0),
  constraint course_students_name_or_roll_present check (
    nullif(btrim(coalesce(roll_number, '')), '') is not null
    or nullif(btrim(coalesce(student_name, '')), '') is not null
  )
);

alter table public.course_students
  drop constraint if exists course_students_business_course_fkey;

alter table public.course_students
  add constraint course_students_business_course_fkey
  foreign key (source_course_id, business_id)
  references public.courses (id, business_id)
  on delete restrict;

create unique index if not exists course_students_id_business_key
  on public.course_students (id, business_id);

alter table public.course_students
  drop constraint if exists course_students_business_last_payment_fkey;

alter table public.course_students
  add constraint course_students_business_last_payment_fkey
  foreign key (last_payment_id, business_id)
  references public.payments (id, business_id)
  on delete restrict;

alter table public.payments
  drop constraint if exists payments_business_course_student_fkey;

alter table public.payments
  add constraint payments_business_course_student_fkey
  foreign key (course_student_id, business_id)
  references public.course_students (id, business_id)
  on delete restrict;

create index if not exists course_students_business_active_course_idx
  on public.course_students (business_id, active, source_course_id, subscription_end_date desc);

create index if not exists payments_business_course_student_idx
  on public.payments (business_id, course_student_id, payment_date desc)
  where course_student_id is not null;

drop trigger if exists touch_course_students_updated_at on public.course_students;
create trigger touch_course_students_updated_at before update on public.course_students
for each row execute function public.touch_updated_at();

-- Backfill one durable student per current course identity, choosing the latest
-- payment as the roster snapshot. Expiry intentionally does not change active.
with ranked as (
  select
    p.*,
    coalesce(p.skill_course_id, p.course_id) as source_course_id,
    case
      when nullif(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''), '') is not null
        then 'roll:' || lower(regexp_replace(btrim(p.roll_number), '\.0+$', ''))
      when nullif(btrim(coalesce(p.customer_name, '')), '') is not null
        then 'name:' || lower(regexp_replace(btrim(p.customer_name), '\s+', ' ', 'g'))
      else 'payment:' || p.id::text
    end as identity_key,
    row_number() over (
      partition by p.business_id,
        coalesce(p.skill_course_id, p.course_id),
        case
          when nullif(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''), '') is not null
            then 'roll:' || lower(regexp_replace(btrim(p.roll_number), '\.0+$', ''))
          when nullif(btrim(coalesce(p.customer_name, '')), '') is not null
            then 'name:' || lower(regexp_replace(btrim(p.customer_name), '\s+', ' ', 'g'))
          else 'payment:' || p.id::text
        end
      order by p.end_date desc nulls last, p.payment_date desc, p.created_at desc, p.id desc
    ) as identity_rank
  from public.payments p
  where p.business_type = 'course'
    and p.record_status = 'active'
    and coalesce(p.skill_course_id, p.course_id) is not null
), inserted as (
  insert into public.course_students (
    business_id, source_course_id, identity_key, roll_number, student_name,
    aadhar_photo_url, aadhar_back_photo_url, subscription_start_date,
    subscription_end_date, start_time, end_time, slot_hours, fee_amount,
    paid_amount, dues_amount, advance_amount, active, last_payment_id
  )
  select
    business_id, source_course_id, identity_key,
    nullif(regexp_replace(btrim(coalesce(roll_number, '')), '\.0+$', ''), ''),
    nullif(btrim(coalesce(customer_name, '')), ''),
    aadhar_photo_url, aadhar_back_photo_url, start_date, end_date,
    start_time, end_time, slot_hours, fee_amount, paid_amount, dues_amount,
    advance_amount, true, id
  from ranked
  where identity_rank = 1
  on conflict (business_id, source_course_id, identity_key) do update set
    roll_number = excluded.roll_number,
    student_name = excluded.student_name,
    aadhar_photo_url = coalesce(excluded.aadhar_photo_url, course_students.aadhar_photo_url),
    aadhar_back_photo_url = coalesce(excluded.aadhar_back_photo_url, course_students.aadhar_back_photo_url),
    subscription_start_date = excluded.subscription_start_date,
    subscription_end_date = excluded.subscription_end_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    slot_hours = excluded.slot_hours,
    fee_amount = excluded.fee_amount,
    paid_amount = excluded.paid_amount,
    dues_amount = excluded.dues_amount,
    advance_amount = excluded.advance_amount,
    last_payment_id = excluded.last_payment_id
  returning id, business_id, source_course_id, identity_key
)
update public.payments p
set course_student_id = cs.id
from public.course_students cs
where p.business_type = 'course'
  and p.business_id = cs.business_id
  and coalesce(p.skill_course_id, p.course_id) = cs.source_course_id
  and case
    when nullif(regexp_replace(btrim(coalesce(p.roll_number, '')), '\.0+$', ''), '') is not null
      then 'roll:' || lower(regexp_replace(btrim(p.roll_number), '\.0+$', ''))
    when nullif(btrim(coalesce(p.customer_name, '')), '') is not null
      then 'name:' || lower(regexp_replace(btrim(p.customer_name), '\s+', ' ', 'g'))
    else 'payment:' || p.id::text
  end = cs.identity_key
  and p.course_student_id is distinct from cs.id;

-- Historical accepted transfers define the final operational owner. Normalize
-- their audit value to the whole payment without changing existing cash ledger.
with latest_accepted as (
  select distinct on (mm.business_id, mm.payment_id)
    mm.business_id, mm.payment_id, mm.to_profile_id
  from public.money_movements mm
  where mm.payment_id is not null
    and mm.type = 'transfer'
    and mm.status = 'accepted'
    and mm.to_profile_id is not null
  order by mm.business_id, mm.payment_id, mm.responded_at desc nulls last, mm.created_at desc
)
update public.payments p
set assigned_profile_id = coalesce(la.to_profile_id, p.current_holder_id, p.collected_by)
from latest_accepted la
where p.business_id = la.business_id
  and p.id = la.payment_id;

update public.money_movements mm
set amount = p.amount,
    mode = p.mode
from public.payments p
where mm.business_id = p.business_id
  and mm.payment_id = p.id
  and mm.type = 'transfer'
  and mm.status = 'accepted';

alter table public.course_students enable row level security;

drop policy if exists "course_students_select_visible" on public.course_students;
create policy "course_students_select_visible" on public.course_students
for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or private.can_collect_business(business_id, 'course')
  )
);

drop policy if exists "course_students_write_allowed" on public.course_students;
create policy "course_students_write_allowed" on public.course_students
for all to authenticated
using (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'course')
)
with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, 'course')
);

drop policy if exists "payments_select_visible" on public.payments;
drop policy if exists payments_select_tenant on public.payments;
create policy "payments_select_visible" on public.payments
for select to authenticated
using (
  private.can_read_business(business_id)
  and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or assigned_profile_id = auth.uid()
    or referral_agent_id = auth.uid()
    or exists (
      select 1 from public.referral_codes rc
      where rc.business_id = payments.business_id
        and rc.id = payments.referral_code_id
        and rc.agent_id = auth.uid()
    )
    or exists (
      select 1 from public.money_movements mm
      where mm.business_id = payments.business_id
        and mm.payment_id = payments.id
        and mm.to_profile_id = auth.uid()
        and mm.status = 'pending'
    )
  )
);

drop policy if exists payments_insert_tenant on public.payments;
create policy payments_insert_tenant on public.payments for insert to authenticated with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, business_type)
  and collected_by = auth.uid()
  and assigned_profile_id = auth.uid()
  and (current_holder_id is null or current_holder_id = auth.uid())
);

drop policy if exists payments_update_tenant on public.payments;
create policy payments_update_tenant on public.payments for update to authenticated using (
  not public.has_active_support_session(business_id)
  and (
    public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or (assigned_profile_id = auth.uid() and approval_status <> 'approved')
  )
) with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
);

create or replace function private.guard_payment_assignment_update()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if (
    new.assigned_profile_id is distinct from old.assigned_profile_id
    or new.current_holder_id is distinct from old.current_holder_id
  ) and coalesce(current_setting('lenden.payment_transfer_response', true), '') <> '1' then
    raise exception 'Transaction assignment and cash custody can only change through transfer acceptance.';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_assignment_update on public.payments;
create trigger payments_guard_assignment_update
before update of assigned_profile_id, current_holder_id on public.payments
for each row execute function private.guard_payment_assignment_update();

-- Atomically accepts/rejects a payment transfer. Assignment always moves; cash
-- custody and transfer ledger entries move only when the payment contains cash.
create or replace function public.lenden_respond_payment_transfer(
  p_movement_id uuid,
  p_decision public.movement_status,
  p_entry_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  movement_row public.money_movements%rowtype;
  payment_row public.payments%rowtype;
  cash_amount numeric(12,2);
  cash_is_approved boolean;
  response_time timestamptz := now();
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Choose a valid transfer response.';
  end if;

  select * into movement_row
  from public.money_movements
  where id = p_movement_id
  for update;

  if not found or movement_row.type <> 'transfer' or movement_row.payment_id is null then
    raise exception 'Transaction transfer not found.';
  end if;
  if movement_row.business_id is distinct from private.current_business_id() then
    raise exception 'Transaction transfer is outside the selected business.';
  end if;
  if movement_row.to_profile_id is distinct from auth.uid() then
    raise exception 'Only the receiving staff can respond to this transfer.';
  end if;
  if movement_row.status <> 'pending' then
    if movement_row.status = p_decision then
      select * into payment_row from public.payments where id = movement_row.payment_id;
      return jsonb_build_object('payment', to_jsonb(payment_row), 'movement', to_jsonb(movement_row));
    end if;
    raise exception 'This transfer has already been reviewed.';
  end if;

  select * into payment_row
  from public.payments
  where id = movement_row.payment_id
    and business_id = movement_row.business_id
  for update;

  if not found then raise exception 'Payment not found.'; end if;
  if payment_row.record_status <> 'active'
    or payment_row.approval_status not in ('pending', 'approved', 'reapproval_required', 'cancel_requested') then
    raise exception 'This transaction can no longer be transferred.';
  end if;
  if payment_row.assigned_profile_id is distinct from movement_row.from_profile_id then
    raise exception 'The transaction assignee changed before this transfer was reviewed.';
  end if;
  if not exists (
    select 1
    from public.business_memberships bm
    join public.business_member_permissions bmp on bmp.membership_id = bm.id
    where bm.business_id = movement_row.business_id
      and bm.profile_id = auth.uid()
      and bm.role = 'staff'
      and bm.status = 'active'
      and bmp.permission = case payment_row.business_type
        when 'guest_house' then 'collect_guest_house'
        when 'library' then 'collect_library'
        when 'course' then 'collect_course'
        when 'general' then 'collect_general'
      end
  ) then
    raise exception 'The receiving staff membership or collection permission is no longer active.';
  end if;

  cash_amount := case
    when payment_row.mode = 'cash' then payment_row.amount
    when payment_row.mode = 'mixed' then coalesce(payment_row.cash_collection, 0)
    else 0
  end;
  cash_is_approved := cash_amount > 0 and coalesce(
    payment_row.cash_approval_status = 'approved',
    payment_row.approval_status = 'approved'
  );

  if p_decision = 'accepted' then
    perform set_config('lenden.payment_transfer_response', '1', true);
    update public.payments
    set assigned_profile_id = movement_row.to_profile_id,
        current_holder_id = case when cash_amount > 0 then movement_row.to_profile_id else current_holder_id end
    where id = payment_row.id
    returning * into payment_row;
    perform set_config('lenden.payment_transfer_response', '', true);

    if cash_is_approved then
      insert into public.ledger_entries (
        business_id, account_profile_id, amount, entry_date, source_type,
        source_id, description, created_by
      ) values
        (movement_row.business_id, movement_row.from_profile_id, -cash_amount, p_entry_date,
          'transfer', movement_row.id, 'Approved transaction cash transferred out', auth.uid()),
        (movement_row.business_id, movement_row.to_profile_id, cash_amount, p_entry_date,
          'transfer', movement_row.id, 'Approved transaction cash received', auth.uid())
      on conflict do nothing;
    end if;
  end if;

  update public.money_movements
  set status = p_decision,
      responded_by = auth.uid(),
      responded_at = response_time,
      amount = payment_row.amount,
      mode = payment_row.mode
  where id = movement_row.id
  returning * into movement_row;

  return jsonb_build_object('payment', to_jsonb(payment_row), 'movement', to_jsonb(movement_row));
end;
$$;

revoke all on function public.lenden_respond_payment_transfer(uuid, public.movement_status, date) from public;
grant execute on function public.lenden_respond_payment_transfer(uuid, public.movement_status, date) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'library_students'
    ) then
      alter publication supabase_realtime add table public.library_students;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'course_students'
    ) then
      alter publication supabase_realtime add table public.course_students;
    end if;
  end if;
end $$;
