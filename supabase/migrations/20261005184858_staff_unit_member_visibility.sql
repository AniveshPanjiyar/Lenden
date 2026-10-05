-- Staff can see all activity in their assigned units (20261005083348), but member
-- visibility still required peers to share a manager, so a colleague's collection
-- showed "Collected by Unknown". Staff now see members who share one of their
-- units: staff assigned to the same unit and managers scoped to it.

create or replace function private.can_view_business_member(target_business_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_active_support_session(target_business_id)
      or target_profile_id = auth.uid()
      or public.has_business_role(
        target_business_id,
        array['primary_owner', 'co_owner']::public.business_role[]
      )
      or (
        public.has_business_role(
          target_business_id,
          array['staff']::public.business_role[]
        )
        and (
          exists (
            select 1
            from public.business_memberships target
            where target.business_id = target_business_id
              and target.profile_id = target_profile_id
              and target.role = 'primary_owner'
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments mine
            join public.business_staff_unit_assignments peer
              on peer.business_id = mine.business_id
             and peer.business_type = mine.business_type
            where mine.business_id = target_business_id
              and mine.staff_profile_id = auth.uid()
              and peer.staff_profile_id = target_profile_id
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments mine
            join public.business_manager_unit_scopes scope
              on scope.business_id = mine.business_id
             and scope.business_type = mine.business_type
            where mine.business_id = target_business_id
              and mine.staff_profile_id = auth.uid()
              and scope.manager_profile_id = target_profile_id
          )
          or exists (
            select 1
            from public.business_staff_unit_assignments mine
            where mine.business_id = target_business_id
              and mine.staff_profile_id = auth.uid()
              and mine.manager_profile_id = target_profile_id
          )
        )
      )
    );
$$;
