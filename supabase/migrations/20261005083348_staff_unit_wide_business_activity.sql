-- Staff assigned to a business unit see all of that unit's business activity
-- (collections and expenses), whoever recorded it. Previously staff only saw
-- their own entries, the owner's, and those of peers under the same manager,
-- so staff without a manager could not see each other's collections.
-- Owner, manager and support-session visibility are unchanged.

create or replace function private.can_view_business_activity(
  target_business_id uuid,
  target_business_type public.payment_business,
  target_actor_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['co_owner']::public.business_role[]
        )
        and exists (
          select 1
          from public.business_manager_unit_scopes viewer_scope
          join public.business_memberships actor
            on actor.business_id = viewer_scope.business_id
           and actor.profile_id = target_actor_profile_id
           and actor.status = 'active'
          where viewer_scope.business_id = target_business_id
            and viewer_scope.manager_profile_id = auth.uid()
            and viewer_scope.business_type = target_business_type
            and (
              actor.role = 'primary_owner'
              or actor.profile_id = auth.uid()
              or (
                actor.role = 'co_owner'
                and exists (
                  select 1
                  from public.business_manager_unit_scopes actor_scope
                  where actor_scope.business_id = target_business_id
                    and actor_scope.manager_profile_id = actor.profile_id
                    and actor_scope.business_type = target_business_type
                )
              )
              or (
                actor.role = 'staff'
                and exists (
                  select 1
                  from public.business_staff_unit_assignments assignment
                  where assignment.business_id = target_business_id
                    and assignment.staff_profile_id = actor.profile_id
                    and assignment.business_type = target_business_type
                )
              )
            )
        )
      )
      or (
        public.has_business_role(
          target_business_id,
          array['staff']::public.business_role[]
        )
        and exists (
          select 1
          from public.business_staff_unit_assignments mine
          where mine.business_id = target_business_id
            and mine.business_type = target_business_type
            and mine.staff_profile_id = auth.uid()
        )
      )
    );
$$;
