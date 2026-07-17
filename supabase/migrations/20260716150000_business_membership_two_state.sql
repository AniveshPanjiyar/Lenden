-- Business access has exactly two states. Invitations live in the separate
-- business_invitations table and must not create an "invited" membership row.
update public.business_memberships
set status = 'suspended',
    suspended_at = coalesce(suspended_at, now()),
    updated_at = now()
where status = 'invited';

alter table public.business_memberships
  drop constraint if exists business_memberships_active_or_suspended;

alter table public.business_memberships
  add constraint business_memberships_active_or_suspended
  check (status in ('active', 'suspended'));
