-- Make transaction-transfer access explicit and preserve it through every
-- membership/invitation workflow.

drop policy if exists movements_insert_tenant on public.money_movements;
create policy movements_insert_tenant
on public.money_movements
for insert
to authenticated
with check (
  money_movements.business_id = private.requested_business_id()
  and not public.has_active_support_session(money_movements.business_id)
  and (
    public.has_business_role(
      money_movements.business_id,
      array['primary_owner']::public.business_role[]
    )
    or (
      (
        public.has_business_role(
          money_movements.business_id,
          array['co_owner']::public.business_role[]
        )
        or (
          money_movements.requested_by = auth.uid()
          and money_movements.from_profile_id = auth.uid()
          and public.has_business_permission(money_movements.business_id, 'transfer_money')
        )
      )
      and (
        money_movements.payment_id is null
        or exists (
          select 1
          from public.payments payment
          where payment.id = money_movements.payment_id
            and payment.business_id = money_movements.business_id
            and (
              public.has_business_role(
                money_movements.business_id,
                array['co_owner']::public.business_role[]
              )
              or payment.assigned_profile_id = auth.uid()
            )
            and payment.record_status = 'active'
            and payment.approval_status <> 'approved'
            and coalesce(payment.cash_approval_status::text, 'pending') <> 'approved'
            and coalesce(payment.online_approval_status::text, 'pending') <> 'approved'
            and not exists (
              select 1
              from public.ledger_entries ledger
              where ledger.source_type = 'payment'
                and ledger.source_id = payment.id
            )
        )
      )
    )
  )
);

create or replace function public.replace_staff_permissions(
  target_business_id uuid,
  target_membership_id uuid,
  target_permissions text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_membership public.business_memberships%rowtype;
  previous_permissions text[];
  sanitized_permissions text[];
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.profile_can_assign_business_role(
    actor_id,
    target_business_id,
    'staff'::public.business_role
  ) then
    raise exception 'You cannot manage Staff permissions.' using errcode = '42501';
  end if;

  select *
  into target_membership
  from public.business_memberships
  where id = target_membership_id
    and business_id = target_business_id
  for update;

  if target_membership.id is null then
    raise exception 'Staff membership was not found.' using errcode = '22023';
  end if;
  if target_membership.role <> 'staff' then
    raise exception 'Granular permissions apply only to Staff memberships.' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission order by permission), '{}')
  into previous_permissions
  from public.business_member_permissions
  where membership_id = target_membership.id;

  select coalesce(array_agg(distinct permission order by permission), '{}')
  into sanitized_permissions
  from unnest(coalesce(target_permissions, '{}')) permission
  where permission in (
    'collect_guest_house',
    'collect_library',
    'collect_course',
    'collect_general',
    'add_expense',
    'transfer_money'
  );

  delete from public.business_member_permissions
  where membership_id = target_membership.id;

  insert into public.business_member_permissions (membership_id, permission, granted_by)
  select target_membership.id, permission, actor_id
  from unnest(sanitized_permissions) permission;

  insert into public.audit_events (
    business_id,
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    target_business_id,
    actor_id,
    'staff_permissions_updated',
    'business_membership',
    target_membership.id,
    jsonb_build_object('permissions', previous_permissions),
    jsonb_build_object('permissions', sanitized_permissions)
  );
end;
$$;

grant execute on function public.replace_staff_permissions(uuid, uuid, text[]) to authenticated;

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
    where permission in (
      'collect_guest_house',
      'collect_library',
      'collect_course',
      'collect_general',
      'add_expense',
      'transfer_money'
    )
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
    where permission in (
      'collect_guest_house',
      'collect_library',
      'collect_course',
      'collect_general',
      'add_expense',
      'transfer_money'
    )
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

create or replace function public.accept_business_invitation(invitation_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invitation_id uuid;
begin
  select id
  into target_invitation_id
  from public.business_invitations
  where token_hash = invitation_token_hash;

  if target_invitation_id is null then
    raise exception 'Invitation is invalid or no longer active.' using errcode = '22023';
  end if;

  return public.accept_business_invitation(target_invitation_id);
end;
$$;

grant execute on function public.accept_business_invitation(text) to authenticated;

-- Existing collecting Staff previously saw the transfer control but could not
-- satisfy the hidden RLS permission. Preserve their intended access.
insert into public.business_member_permissions (membership_id, permission, granted_by)
select
  collecting_membership.id,
  'transfer_money',
  owner_membership.profile_id
from public.business_memberships collecting_membership
join lateral (
  select bm.profile_id
  from public.business_memberships bm
  where bm.business_id = collecting_membership.business_id
    and bm.role = 'primary_owner'
  order by (bm.status = 'active') desc, bm.joined_at nulls last
  limit 1
) owner_membership on true
where collecting_membership.role = 'staff'
  and exists (
    select 1
    from public.business_member_permissions existing_permission
    where existing_permission.membership_id = collecting_membership.id
      and existing_permission.permission in (
        'collect_guest_house',
        'collect_library',
        'collect_course',
        'collect_general'
      )
  )
on conflict (membership_id, permission) do nothing;
