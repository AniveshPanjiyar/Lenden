-- Multi-business foundation. This migration is deliberately additive: legacy
-- role columns and permissions remain available until the tenant path is stable.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type public.platform_role as enum ('user', 'platform_admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'business_role') then
    create type public.business_role as enum ('primary_owner', 'co_owner', 'staff', 'sales_agent');
  end if;
  if not exists (select 1 from pg_type where typname = 'business_status') then
    create type public.business_status as enum ('active', 'suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum ('invited', 'active', 'suspended');
  end if;
end $$;

alter table public.profiles
  add column if not exists platform_role public.platform_role not null default 'user',
  add column if not exists account_status public.business_status not null default 'active',
  add column if not exists must_change_password boolean not null default false,
  add column if not exists last_business_id uuid;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) >= 2),
  slug text not null,
  status public.business_status not null default 'active',
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suspended_at timestamptz,
  constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint businesses_slug_key unique (slug)
);

alter table public.profiles
  drop constraint if exists profiles_last_business_id_fkey;
alter table public.profiles
  add constraint profiles_last_business_id_fkey
  foreign key (last_business_id) references public.businesses(id) on delete set null;

create table if not exists public.business_modules (
  business_id uuid not null references public.businesses(id) on delete cascade,
  module public.payment_business not null,
  enabled boolean not null default true,
  configured_at timestamptz not null default now(),
  configured_by uuid references public.profiles(id) on delete set null,
  primary key (business_id, module)
);

create table if not exists public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role public.business_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_memberships_business_profile_key unique (business_id, profile_id),
  constraint business_memberships_business_profile_membership_key unique (business_id, profile_id, id)
);

create unique index if not exists business_memberships_one_primary_owner_idx
  on public.business_memberships (business_id)
  where role = 'primary_owner' and status = 'active';

create table if not exists public.business_member_permissions (
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  permission text not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (membership_id, permission)
);

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null,
  intended_role public.business_role not null,
  permissions text[] not null default '{}',
  token_hash text not null unique,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists business_invitations_active_email_idx
  on public.business_invitations (business_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table if not exists public.business_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 5),
  access_level text not null default 'configuration' check (access_level = 'configuration'),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint business_support_sessions_max_duration check (expires_at <= started_at + interval '30 minutes')
);

create index if not exists business_support_sessions_active_idx
  on public.business_support_sessions (admin_profile_id, business_id, expires_at desc)
  where ended_at is null;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_events_business_created_idx
  on public.audit_events (business_id, created_at desc);
create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_profile_id, created_at desc);

-- Tenant-owned tables keep nullable business_id during the backfill phase.
alter table public.rooms add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.courses add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.referral_codes add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.payments add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.expenses add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.money_movements add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.ledger_entries add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.record_change_requests add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.agent_settlements add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.app_notifications add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.app_action_requests add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.library_students add column if not exists business_id uuid references public.businesses(id) on delete restrict;
alter table public.library_student_subscription_events add column if not exists business_id uuid references public.businesses(id) on delete restrict;

do $$
declare
  legacy_business_id uuid;
  primary_profile_id uuid;
begin
  insert into public.businesses (name, slug, timezone, currency)
  values ('Lenden Legacy Business', 'lenden-legacy', 'Asia/Kolkata', 'INR')
  on conflict (slug) do update set name = excluded.name
  returning id into legacy_business_id;

  select p.id into primary_profile_id
  from public.profiles p
  where p.active = true and p.role = 'admin'
  order by p.created_at, p.id
  limit 1;

  if primary_profile_id is null then
    select p.id into primary_profile_id
    from public.profiles p
    where p.active = true and p.role = 'owner'
    order by p.created_at, p.id
    limit 1;
  end if;

  if primary_profile_id is not null then
    update public.profiles
    set platform_role = 'platform_admin'
    where id = primary_profile_id and role = 'admin';
  end if;

  insert into public.business_modules (business_id, module, enabled)
  select legacy_business_id, module, true
  from unnest(enum_range(null::public.payment_business)) module
  on conflict (business_id, module) do update set enabled = excluded.enabled;

  insert into public.business_memberships (
    business_id, profile_id, role, status, joined_at
  )
  select
    legacy_business_id,
    p.id,
    case
      when p.id = primary_profile_id then 'primary_owner'::public.business_role
      when p.role in ('admin', 'owner') then 'co_owner'::public.business_role
      when p.role = 'sales_agent' then 'sales_agent'::public.business_role
      else 'staff'::public.business_role
    end,
    case when p.active then 'active'::public.membership_status else 'suspended'::public.membership_status end,
    p.created_at
  from public.profiles p
  on conflict (business_id, profile_id) do update
  set role = excluded.role,
      status = excluded.status,
      joined_at = coalesce(public.business_memberships.joined_at, excluded.joined_at);

  insert into public.business_member_permissions (membership_id, permission)
  select bm.id, sp.permission
  from public.staff_permissions sp
  join public.business_memberships bm
    on bm.business_id = legacy_business_id and bm.profile_id = sp.profile_id
  on conflict (membership_id, permission) do nothing;

  update public.rooms set business_id = legacy_business_id where business_id is null;
  update public.courses set business_id = legacy_business_id where business_id is null;
  update public.referral_codes set business_id = legacy_business_id where business_id is null;
  update public.payments set business_id = legacy_business_id where business_id is null;
  update public.expenses set business_id = legacy_business_id where business_id is null;
  update public.money_movements set business_id = legacy_business_id where business_id is null;
  update public.ledger_entries set business_id = legacy_business_id where business_id is null;
  update public.record_change_requests set business_id = legacy_business_id where business_id is null;
  update public.agent_settlements set business_id = legacy_business_id where business_id is null;
  update public.app_notifications set business_id = legacy_business_id where business_id is null;
  update public.app_action_requests set business_id = legacy_business_id where business_id is null;
  update public.library_students set business_id = legacy_business_id where business_id is null;
  update public.library_student_subscription_events set business_id = legacy_business_id where business_id is null;

  update public.profiles
  set last_business_id = legacy_business_id
  where last_business_id is null
    and exists (
      select 1 from public.business_memberships bm
      where bm.business_id = legacy_business_id
        and bm.profile_id = public.profiles.id
        and bm.status = 'active'
    );
end $$;

drop trigger if exists touch_businesses_updated_at on public.businesses;
create trigger touch_businesses_updated_at before update on public.businesses
for each row execute function public.touch_updated_at();

drop trigger if exists touch_business_memberships_updated_at on public.business_memberships;
create trigger touch_business_memberships_updated_at before update on public.business_memberships
for each row execute function public.touch_updated_at();
