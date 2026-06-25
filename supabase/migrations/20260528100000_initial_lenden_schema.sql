create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'owner', 'staff', 'sales_agent');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_business') then
    create type public.payment_business as enum ('guest_house', 'library', 'course', 'general');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_mode') then
    create type public.payment_mode as enum ('cash', 'online');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('pending', 'approved', 'reapproval_required', 'cancel_requested', 'cancelled', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'movement_type') then
    create type public.movement_type as enum ('transfer', 'settlement');
  end if;
  if not exists (select 1 from pg_type where typname = 'movement_status') then
    create type public.movement_status as enum ('pending', 'accepted', 'rejected');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, permission)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  label text,
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('main', 'skill')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name, kind)
);

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  agent_id uuid references public.profiles(id) on delete set null,
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_type public.payment_business not null,
  mode public.payment_mode not null,
  amount numeric(12,2) not null check (amount >= 0),
  fee_amount numeric(12,2),
  paid_amount numeric(12,2),
  dues_amount numeric(12,2),
  advance_amount numeric(12,2),
  payment_date date not null default current_date,
  start_date date,
  end_date date,
  customer_name text,
  roll_number text,
  room_id uuid references public.rooms(id) on delete set null,
  room_number_snapshot text,
  seat_number text,
  start_time time,
  end_time time,
  slot_hours numeric(5,2),
  course_id uuid references public.courses(id) on delete set null,
  skill_course_id uuid references public.courses(id) on delete set null,
  referral_code_id uuid references public.referral_codes(id) on delete set null,
  referral_code_snapshot text,
  description text,
  remark text,
  photo_path text,
  collected_by uuid not null references public.profiles(id),
  current_holder_id uuid references public.profiles(id),
  approval_status public.approval_status not null default 'pending',
  record_status text not null default 'active' check (record_status in ('active', 'cancelled')),
  cancel_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (business_type = 'general' and char_length(coalesce(description, '')) >= 3)
    or business_type <> 'general'
  )
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_type public.payment_business,
  mode public.payment_mode not null default 'cash',
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null default current_date,
  description text not null check (char_length(description) >= 3),
  remark text,
  photo_path text,
  spent_by uuid not null references public.profiles(id),
  approval_status public.approval_status not null default 'pending',
  record_status text not null default 'active' check (record_status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.money_movements (
  id uuid primary key default gen_random_uuid(),
  type public.movement_type not null,
  mode public.payment_mode not null default 'cash',
  amount numeric(12,2) not null check (amount > 0),
  from_profile_id uuid not null references public.profiles(id),
  to_profile_id uuid references public.profiles(id),
  status public.movement_status not null default 'pending',
  requested_by uuid not null references public.profiles(id),
  responded_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_profile_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null,
  entry_date date not null default current_date,
  source_type text not null check (source_type in ('payment', 'expense', 'transfer', 'settlement', 'adjustment')),
  source_id uuid,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.record_change_requests (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('payment', 'expense')),
  record_id uuid not null,
  request_type text not null check (request_type in ('edit', 'cancel')),
  requested_by uuid not null references public.profiles(id),
  status public.movement_status not null default 'pending',
  reason text,
  proposed_changes jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists payments_business_date_idx on public.payments (business_type, payment_date desc);
create index if not exists payments_collected_by_idx on public.payments (collected_by);
create index if not exists payments_holder_idx on public.payments (current_holder_id);
create index if not exists expenses_spent_by_idx on public.expenses (spent_by, expense_date desc);
create index if not exists ledger_account_date_idx on public.ledger_entries (account_profile_id, entry_date desc);
create index if not exists movements_parties_idx on public.money_movements (from_profile_id, to_profile_id, status);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_payments_updated_at on public.payments;
create trigger touch_payments_updated_at before update on public.payments
for each row execute function public.touch_updated_at();

drop trigger if exists touch_expenses_updated_at on public.expenses;
create trigger touch_expenses_updated_at before update on public.expenses
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid()) and active = true;
$$;

create or replace function public.is_ownerish()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'owner'), false);
$$;

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_ownerish(), false)
    or exists (
      select 1
      from public.staff_permissions sp
      join public.profiles p on p.id = sp.profile_id
      where sp.profile_id = (select auth.uid())
        and p.active = true
        and sp.permission = required_permission
    );
$$;

create or replace function public.can_collect(business public.payment_business)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_ownerish()
    or public.has_permission(
      case business
        when 'guest_house' then 'collect_guest_house'
        when 'library' then 'collect_library'
        when 'course' then 'collect_course'
        when 'general' then 'collect_general'
      end
    );
$$;

alter table public.profiles enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.rooms enable row level security;
alter table public.courses enable row level security;
alter table public.referral_codes enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.money_movements enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.record_change_requests enable row level security;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible" on public.profiles
for select to authenticated
using (public.is_ownerish() or id = (select auth.uid()) or public.current_user_role() = 'sales_agent');

drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write" on public.profiles
for all to authenticated
using (public.is_ownerish())
with check (public.is_ownerish());

drop policy if exists "permissions_owner_read" on public.staff_permissions;
create policy "permissions_owner_read" on public.staff_permissions
for select to authenticated
using (public.is_ownerish() or profile_id = (select auth.uid()));

drop policy if exists "permissions_owner_write" on public.staff_permissions;
create policy "permissions_owner_write" on public.staff_permissions
for all to authenticated
using (public.is_ownerish())
with check (public.is_ownerish());

drop policy if exists "settings_read" on public.rooms;
create policy "settings_read" on public.rooms for select to authenticated using (true);
drop policy if exists "rooms_owner_write" on public.rooms;
create policy "rooms_owner_write" on public.rooms for all to authenticated using (public.is_ownerish()) with check (public.is_ownerish());

drop policy if exists "courses_read" on public.courses;
create policy "courses_read" on public.courses for select to authenticated using (true);
drop policy if exists "courses_owner_write" on public.courses;
create policy "courses_owner_write" on public.courses for all to authenticated using (public.is_ownerish()) with check (public.is_ownerish());

drop policy if exists "referral_read" on public.referral_codes;
create policy "referral_read" on public.referral_codes for select to authenticated
using (public.is_ownerish() or active = true or agent_id = (select auth.uid()));
drop policy if exists "referral_owner_write" on public.referral_codes;
create policy "referral_owner_write" on public.referral_codes for all to authenticated using (public.is_ownerish()) with check (public.is_ownerish());

drop policy if exists "payments_select_visible" on public.payments;
create policy "payments_select_visible" on public.payments
for select to authenticated
using (
  public.is_ownerish()
  or collected_by = (select auth.uid())
  or current_holder_id = (select auth.uid())
  or exists (
    select 1 from public.referral_codes rc
    where rc.id = referral_code_id and rc.agent_id = (select auth.uid())
  )
);

drop policy if exists "payments_insert_allowed" on public.payments;
create policy "payments_insert_allowed" on public.payments
for insert to authenticated
with check (
  public.can_collect(business_type)
  and collected_by = (select auth.uid())
  and (current_holder_id = (select auth.uid()) or current_holder_id is null)
);

drop policy if exists "payments_update_allowed" on public.payments;
create policy "payments_update_allowed" on public.payments
for update to authenticated
using (public.is_ownerish() or (collected_by = (select auth.uid()) and approval_status <> 'approved'))
with check (public.is_ownerish() or (collected_by = (select auth.uid()) and approval_status <> 'approved'));

drop policy if exists "expenses_select_visible" on public.expenses;
create policy "expenses_select_visible" on public.expenses
for select to authenticated
using (public.is_ownerish() or spent_by = (select auth.uid()));

drop policy if exists "expenses_insert_allowed" on public.expenses;
create policy "expenses_insert_allowed" on public.expenses
for insert to authenticated
with check ((spent_by = (select auth.uid()) and public.has_permission('add_expense')) or public.is_ownerish());

drop policy if exists "expenses_update_allowed" on public.expenses;
create policy "expenses_update_allowed" on public.expenses
for update to authenticated
using (public.is_ownerish() or (spent_by = (select auth.uid()) and approval_status <> 'approved'))
with check (public.is_ownerish() or (spent_by = (select auth.uid()) and approval_status <> 'approved'));

drop policy if exists "movements_select_visible" on public.money_movements;
create policy "movements_select_visible" on public.money_movements
for select to authenticated
using (public.is_ownerish() or from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid()));

drop policy if exists "movements_insert_allowed" on public.money_movements;
create policy "movements_insert_allowed" on public.money_movements
for insert to authenticated
with check (
  public.is_ownerish()
  or (
    requested_by = (select auth.uid())
    and from_profile_id = (select auth.uid())
    and public.has_permission('transfer_money')
  )
);

drop policy if exists "movements_update_allowed" on public.money_movements;
create policy "movements_update_allowed" on public.money_movements
for update to authenticated
using (public.is_ownerish() or to_profile_id = (select auth.uid()))
with check (public.is_ownerish() or to_profile_id = (select auth.uid()));

drop policy if exists "ledger_select_visible" on public.ledger_entries;
create policy "ledger_select_visible" on public.ledger_entries
for select to authenticated
using (public.is_ownerish() or account_profile_id = (select auth.uid()));

drop policy if exists "ledger_owner_insert" on public.ledger_entries;
create policy "ledger_owner_insert" on public.ledger_entries
for insert to authenticated
with check (public.is_ownerish() or created_by = (select auth.uid()));

drop policy if exists "changes_select_visible" on public.record_change_requests;
create policy "changes_select_visible" on public.record_change_requests
for select to authenticated
using (public.is_ownerish() or requested_by = (select auth.uid()));

drop policy if exists "changes_insert_allowed" on public.record_change_requests;
create policy "changes_insert_allowed" on public.record_change_requests
for insert to authenticated
with check (requested_by = (select auth.uid()));

drop policy if exists "changes_owner_update" on public.record_change_requests;
create policy "changes_owner_update" on public.record_change_requests
for update to authenticated
using (public.is_ownerish())
with check (public.is_ownerish());

insert into public.courses (name, kind) values
  ('9th', 'main'),
  ('10th', 'main'),
  ('Skills', 'main'),
  ('DCA', 'skill'),
  ('ADCA', 'skill'),
  ('ADFA', 'skill'),
  ('Digital Marketing', 'skill'),
  ('Web Development', 'skill'),
  ('GST and return filing', 'skill'),
  ('ITR and return filing', 'skill'),
  ('Excel & Tally', 'skill')
on conflict (name, kind) do nothing;

insert into public.rooms (room_number, label) values
  ('101', 'Room 101'),
  ('102', 'Room 102'),
  ('103', 'Room 103')
on conflict (room_number) do nothing;
