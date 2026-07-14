-- Keep business configuration with the primary owner while preserving the
-- co-owner's ability to manage staff and sales-agent memberships.
create or replace function private.can_configure_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.has_business_role(
        target_business_id,
        array['primary_owner']::public.business_role[]
      ) or public.has_active_support_session(target_business_id)
    );
$$;

-- A coupon is part of its assigned agent's active business access. Keep the
-- row for payment history, but deactivate it when that agent is suspended or
-- moved to another role.
create or replace function private.deactivate_agent_coupons_on_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'sales_agent'
    and (new.role <> 'sales_agent' or new.status <> 'active') then
    update public.referral_codes
    set active = false
    where business_id = old.business_id
      and agent_id = old.profile_id
      and active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists deactivate_agent_coupons_on_membership_change on public.business_memberships;
create trigger deactivate_agent_coupons_on_membership_change
after update of role, status on public.business_memberships
for each row execute function private.deactivate_agent_coupons_on_membership_change();

update public.referral_codes referral
set active = false
where referral.agent_id is not null
  and referral.active = true
  and not exists (
    select 1
    from public.business_memberships membership
    where membership.business_id = referral.business_id
      and membership.profile_id = referral.agent_id
      and membership.role = 'sales_agent'
      and membership.status = 'active'
  );
