-- Separate global identities from business-scoped access and business creation.
-- Existing memberships remain active/suspended; invitations never grant access.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_invitation_state') then
    create type public.business_invitation_state as enum ('pending', 'accepted', 'declined', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'business_creation_request_status') then
    create type public.business_creation_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
  end if;
end $$;

update public.profiles set email = lower(btrim(email)) where email <> lower(btrim(email));
create unique index if not exists profiles_email_lower_key on public.profiles (lower(email));

create table if not exists public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  intended_role public.business_role not null check (intended_role <> 'primary_owner'),
  permissions text[] not null default '{}',
  token_hash text not null unique check (char_length(token_hash) = 64),
  status public.business_invitation_state not null default 'pending',
  invited_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  declined_at timestamptz,
  declined_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_provider_id text,
  delivery_error text,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_invitations_pending_email_idx
  on public.business_invitations (business_id, lower(email))
  where status = 'pending';
create index if not exists business_invitations_email_status_idx
  on public.business_invitations (lower(email), status, expires_at desc);

create table if not exists public.business_creation_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_name text not null check (char_length(btrim(requested_name)) between 2 and 160),
  requested_modules public.payment_business[] not null,
  note text,
  status public.business_creation_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_reason text,
  reviewed_at timestamptz,
  created_business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_creation_requests_modules_not_empty check (cardinality(requested_modules) > 0),
  constraint business_creation_requests_note_length check (note is null or char_length(note) <= 1000)
);

create unique index if not exists business_creation_requests_pending_name_idx
  on public.business_creation_requests (requested_by, lower(requested_name))
  where status = 'pending';
create index if not exists business_creation_requests_status_created_idx
  on public.business_creation_requests (status, created_at desc);

drop trigger if exists touch_business_invitations_updated_at on public.business_invitations;
create trigger touch_business_invitations_updated_at before update on public.business_invitations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_business_creation_requests_updated_at on public.business_creation_requests;
create trigger touch_business_creation_requests_updated_at before update on public.business_creation_requests
for each row execute function public.touch_updated_at();

create or replace function private.profile_can_assign_business_role(
  actor_profile_id uuid,
  target_business_id uuid,
  target_role public.business_role
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = actor_profile_id
        and p.active = true
        and p.account_status = 'active'
        and p.platform_role = 'platform_admin'
    )
    or exists (
      select 1 from public.business_memberships bm
      join public.businesses b on b.id = bm.business_id and b.status = 'active'
      where bm.business_id = target_business_id
        and bm.profile_id = actor_profile_id
        and bm.status = 'active'
        and (
          (bm.role = 'primary_owner' and target_role <> 'primary_owner')
          or (bm.role = 'co_owner' and target_role in ('staff', 'sales_agent'))
        )
    );
$$;

revoke all on function private.profile_can_assign_business_role(uuid, uuid, public.business_role) from public;
grant execute on function private.profile_can_assign_business_role(uuid, uuid, public.business_role) to authenticated;

create or replace function public.grant_business_access(
  target_business_id uuid,
  target_profile_id uuid,
  target_role public.business_role,
  target_permissions text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_profile public.profiles%rowtype;
  previous_membership public.business_memberships%rowtype;
  new_membership_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if target_role = 'primary_owner' then raise exception 'Primary ownership must use the ownership workflow.' using errcode = '42501'; end if;
  if not private.profile_can_assign_business_role(actor_id, target_business_id, target_role) then
    raise exception 'You cannot assign this role.' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where id = target_profile_id for update;
  if target_profile.id is null or not target_profile.active or target_profile.account_status <> 'active' then
    raise exception 'The Lenden account is not active.' using errcode = '22023';
  end if;

  select * into previous_membership
  from public.business_memberships
  where business_id = target_business_id and profile_id = target_profile_id
  for update;

  if previous_membership.role = 'primary_owner' then
    raise exception 'The Owner role cannot be changed here.' using errcode = '42501';
  end if;
  if previous_membership.role = 'co_owner'
    and not exists (
      select 1 from public.profiles p
      where p.id = actor_id and p.active = true and p.account_status = 'active' and p.platform_role = 'platform_admin'
    )
    and not exists (
      select 1 from public.business_memberships bm
      where bm.business_id = target_business_id
        and bm.profile_id = actor_id
        and bm.role = 'primary_owner'
        and bm.status = 'active'
    )
  then
    raise exception 'Managers cannot change another Manager.' using errcode = '42501';
  end if;

  insert into public.business_memberships (
    business_id, profile_id, role, status, invited_by, invited_at, joined_at, suspended_at
  ) values (
    target_business_id, target_profile_id, target_role, 'active', actor_id, now(), now(), null
  )
  on conflict (business_id, profile_id) do update
  set role = excluded.role,
      status = 'active',
      invited_by = actor_id,
      invited_at = now(),
      joined_at = coalesce(public.business_memberships.joined_at, now()),
      suspended_at = null,
      updated_at = now()
  returning id into new_membership_id;

  delete from public.business_member_permissions bmp where bmp.membership_id = new_membership_id;
  if target_role = 'staff' and cardinality(coalesce(target_permissions, '{}')) > 0 then
    insert into public.business_member_permissions (membership_id, permission, granted_by)
    select new_membership_id, permission, actor_id
    from unnest(target_permissions) permission
    where permission in ('collect_guest_house', 'collect_library', 'collect_course', 'collect_general', 'add_expense')
    on conflict (membership_id, permission) do nothing;
  end if;

  update public.business_invitations
  set status = 'revoked', revoked_at = now(), revoked_by = actor_id
  where business_id = target_business_id
    and lower(email) = lower(target_profile.email)
    and status = 'pending';

  insert into public.audit_events (
    business_id, actor_profile_id, event_type, entity_type, entity_id, before_data, after_data
  ) values (
    target_business_id,
    actor_id,
    case
      when previous_membership.id is null then 'membership_granted'
      when previous_membership.status = 'suspended' then 'membership_reactivated'
      else 'membership_updated'
    end,
    'business_membership',
    new_membership_id,
    case when previous_membership.id is null then null else jsonb_build_object('role', previous_membership.role, 'status', previous_membership.status) end,
    jsonb_build_object('role', target_role, 'status', 'active', 'permissions', coalesce(target_permissions, '{}'))
  );

  return new_membership_id;
end;
$$;

grant execute on function public.grant_business_access(uuid, uuid, public.business_role, text[]) to authenticated;

create or replace function public.accept_business_invitation(target_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  actor_confirmed_at timestamptz;
  invitation public.business_invitations%rowtype;
  current_membership public.business_memberships%rowtype;
  new_membership_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profiles
    where id = actor_id and active = true and account_status = 'active'
  ) then
    raise exception 'An active Lenden account is required.' using errcode = '42501';
  end if;
  select lower(email), email_confirmed_at into actor_email, actor_confirmed_at
  from auth.users where id = actor_id;
  if actor_email is null or actor_confirmed_at is null then
    raise exception 'Verify your email before accepting this invitation.' using errcode = '42501';
  end if;

  select * into invitation from public.business_invitations where id = target_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'Invitation is no longer active.' using errcode = '22023';
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation has expired.' using errcode = '22023'; end if;
  if lower(invitation.email) <> actor_email then
    raise exception 'This invitation belongs to another email address.' using errcode = '42501';
  end if;
  if not private.profile_can_assign_business_role(invitation.invited_by, invitation.business_id, invitation.intended_role) then
    raise exception 'The inviter is no longer allowed to grant this access.' using errcode = '42501';
  end if;

  select * into current_membership
  from public.business_memberships
  where business_id = invitation.business_id and profile_id = actor_id
  for update;
  if current_membership.role = 'primary_owner' then
    raise exception 'An invitation cannot replace the protected Owner role.' using errcode = '42501';
  end if;
  if current_membership.role = 'co_owner'
    and not exists (
      select 1 from public.profiles p
      where p.id = invitation.invited_by
        and p.active = true
        and p.account_status = 'active'
        and p.platform_role = 'platform_admin'
    )
    and not exists (
      select 1 from public.business_memberships bm
      where bm.business_id = invitation.business_id
        and bm.profile_id = invitation.invited_by
        and bm.role = 'primary_owner'
        and bm.status = 'active'
    )
  then
    raise exception 'The inviter cannot change an existing Manager.' using errcode = '42501';
  end if;

  insert into public.business_memberships (
    business_id, profile_id, role, status, invited_by, invited_at, joined_at, suspended_at
  ) values (
    invitation.business_id, actor_id, invitation.intended_role, 'active', invitation.invited_by, invitation.created_at, now(), null
  )
  on conflict (business_id, profile_id) do update
  set role = excluded.role,
      status = 'active',
      invited_by = excluded.invited_by,
      invited_at = excluded.invited_at,
      joined_at = coalesce(public.business_memberships.joined_at, now()),
      suspended_at = null,
      updated_at = now()
  returning id into new_membership_id;

  delete from public.business_member_permissions bmp where bmp.membership_id = new_membership_id;
  if invitation.intended_role = 'staff' and cardinality(invitation.permissions) > 0 then
    insert into public.business_member_permissions (membership_id, permission, granted_by)
    select new_membership_id, permission, invitation.invited_by from unnest(invitation.permissions) permission
    where permission in ('collect_guest_house', 'collect_library', 'collect_course', 'collect_general', 'add_expense')
    on conflict (membership_id, permission) do nothing;
  end if;

  update public.business_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = actor_id
  where id = invitation.id;
  update public.profiles set last_business_id = invitation.business_id where id = actor_id and last_business_id is null;

  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id, after_data)
  values (
    invitation.business_id, actor_id, 'invitation_accepted', 'business_membership', new_membership_id,
    jsonb_build_object('invitation_id', invitation.id, 'role', invitation.intended_role)
  );
  return invitation.business_id;
end;
$$;

grant execute on function public.accept_business_invitation(uuid) to authenticated;

create or replace function public.decline_business_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation public.business_invitations%rowtype;
  actor_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select lower(email) into actor_email
  from public.profiles
  where id = auth.uid() and active = true and account_status = 'active';
  if actor_email is null then raise exception 'An active Lenden account is required.' using errcode = '42501'; end if;
  select * into invitation from public.business_invitations where id = target_invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or lower(invitation.email) <> actor_email then
    raise exception 'Invitation is no longer active.' using errcode = '22023';
  end if;
  update public.business_invitations
  set status = 'declined', declined_at = now(), declined_by = auth.uid()
  where id = invitation.id;
  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id)
  values (invitation.business_id, auth.uid(), 'invitation_declined', 'business_invitation', invitation.id);
end;
$$;

grant execute on function public.decline_business_invitation(uuid) to authenticated;

create or replace function public.cancel_business_creation_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.business_creation_requests
  set status = 'cancelled'
  where id = target_request_id and requested_by = auth.uid() and status = 'pending';
  if not found then raise exception 'Pending request was not found.' using errcode = '22023'; end if;
end;
$$;
grant execute on function public.cancel_business_creation_request(uuid) to authenticated;

create or replace function public.approve_business_creation_request(
  target_request_id uuid,
  final_name text,
  final_slug text,
  final_timezone text,
  final_currency text,
  final_modules public.payment_business[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  request_row public.business_creation_requests%rowtype;
  new_business_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_id and active = true and account_status = 'active' and platform_role = 'platform_admin'
  ) then raise exception 'Platform administrator access is required.' using errcode = '42501'; end if;

  select * into request_row from public.business_creation_requests where id = target_request_id for update;
  if request_row.id is null or request_row.status <> 'pending' then
    raise exception 'Pending request was not found.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = request_row.requested_by and active = true and account_status = 'active'
  ) then
    raise exception 'The requester must have an active Lenden account.' using errcode = '22023';
  end if;
  if char_length(btrim(final_name)) < 2 then raise exception 'Business name is required.' using errcode = '22023'; end if;
  if final_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Business slug is invalid.' using errcode = '22023'; end if;
  if final_currency !~ '^[A-Z]{3}$' then raise exception 'Currency is invalid.' using errcode = '22023'; end if;
  if cardinality(final_modules) = 0 then raise exception 'Enable at least one module.' using errcode = '22023'; end if;

  insert into public.businesses (name, slug, status, timezone, currency, created_by)
  values (btrim(final_name), final_slug, 'active', final_timezone, final_currency, actor_id)
  returning id into new_business_id;

  insert into public.business_modules (business_id, module, enabled, configured_by)
  select new_business_id, module, true, actor_id from unnest(final_modules) module;

  insert into public.business_memberships (business_id, profile_id, role, status, invited_by, invited_at, joined_at)
  values (new_business_id, request_row.requested_by, 'primary_owner', 'active', actor_id, now(), now());

  update public.business_creation_requests
  set status = 'approved', reviewed_by = actor_id, reviewed_at = now(), created_business_id = new_business_id, review_reason = null
  where id = request_row.id;
  update public.profiles set last_business_id = new_business_id
  where id = request_row.requested_by and last_business_id is null;

  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id, after_data)
  values (
    new_business_id, actor_id, 'business_request_approved', 'business_creation_request', request_row.id,
    jsonb_build_object('name', final_name, 'slug', final_slug, 'owner_profile_id', request_row.requested_by, 'modules', final_modules)
  );
  return new_business_id;
end;
$$;
grant execute on function public.approve_business_creation_request(uuid, text, text, text, text, public.payment_business[]) to authenticated;

create or replace function public.reject_business_creation_request(target_request_id uuid, rejection_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and account_status = 'active' and platform_role = 'platform_admin'
  ) then raise exception 'Platform administrator access is required.' using errcode = '42501'; end if;
  if char_length(btrim(rejection_reason)) < 3 then raise exception 'A rejection reason is required.' using errcode = '22023'; end if;
  update public.business_creation_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_reason = btrim(rejection_reason)
  where id = target_request_id and status = 'pending';
  if not found then raise exception 'Pending request was not found.' using errcode = '22023'; end if;
end;
$$;
grant execute on function public.reject_business_creation_request(uuid, text) to authenticated;

-- Every Supabase Auth identity receives one global profile. Business access is separate.
create or replace function public.handle_lenden_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  metadata_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  metadata_avatar text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')), '');
begin
  if normalized_email = '' then return new; end if;
  insert into public.profiles (
    id, email, full_name, avatar_url, role, platform_role, account_status, must_change_password, active
  ) values (
    new.id,
    normalized_email,
    coalesce(metadata_name, split_part(normalized_email, '@', 1)),
    metadata_avatar,
    'staff',
    'user',
    'active',
    false,
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_lenden_profile on auth.users;
create trigger on_auth_user_created_lenden_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_lenden_auth_user();

revoke all on function public.handle_lenden_auth_user() from public;

alter table public.business_invitations enable row level security;
alter table public.business_creation_requests enable row level security;

create policy business_invitations_select_authorized on public.business_invitations
for select to authenticated using (
  lower(email) = lower((
    select p.email from public.profiles p
    where p.id = (select auth.uid()) and p.active = true and p.account_status = 'active'
  ))
  or private.profile_can_assign_business_role((select auth.uid()), business_id, intended_role)
);
create policy business_invitations_insert_managed on public.business_invitations
for insert to authenticated with check (
  invited_by = (select auth.uid())
  and private.profile_can_assign_business_role((select auth.uid()), business_id, intended_role)
);
create policy business_invitations_update_managed on public.business_invitations
for update to authenticated using (
  private.profile_can_assign_business_role((select auth.uid()), business_id, intended_role)
) with check (
  private.profile_can_assign_business_role((select auth.uid()), business_id, intended_role)
);

create policy business_creation_requests_select_own_or_admin on public.business_creation_requests
for select to authenticated using (
  requested_by = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.platform_role = 'platform_admin'
      and p.active = true
      and p.account_status = 'active'
  )
);
create policy business_creation_requests_insert_own on public.business_creation_requests
for insert to authenticated with check (
  requested_by = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active = true and p.account_status = 'active'
  )
);

-- Invitation mutations run through authorized server actions and transactional
-- functions. Authenticated API clients may read lifecycle data, but never hashes.
revoke all on public.business_invitations from authenticated;
grant select (
  id, business_id, email, intended_role, permissions, status, invited_by,
  expires_at, accepted_at, accepted_by, declined_at, declined_by,
  revoked_at, revoked_by, delivery_status, delivery_provider_id,
  delivery_error, last_sent_at, created_at, updated_at
) on public.business_invitations to authenticated;

-- New membership creation must go through grant_business_access or an invitation.
-- Existing status controls can change only suspension fields, never identity or role.
revoke insert, update on public.business_memberships from authenticated;
grant update (status, suspended_at) on public.business_memberships to authenticated;
revoke insert, update, delete on public.business_member_permissions from authenticated;

grant select, insert on public.business_creation_requests to authenticated;
