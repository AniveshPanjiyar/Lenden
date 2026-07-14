-- Tenant enforcement, RLS, composite integrity, storage isolation, and audited
-- ownership operations. Apply after 20260714090000_multi_business_foundation.sql.

create schema if not exists private;

create or replace function private.requested_business_id()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  raw_id text;
begin
  raw_id := coalesce((current_setting('request.headers', true)::jsonb ->> 'x-lenden-business-id'), '');
  if raw_id = '' then return null; end if;
  return raw_id::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.account_status = 'active'
      and p.platform_role = 'platform_admin'
  );
$$;

create or replace function public.is_business_member(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships bm
    join public.businesses b on b.id = bm.business_id
    join public.profiles p on p.id = bm.profile_id
    where bm.business_id = target_business_id
      and bm.profile_id = (select auth.uid())
      and bm.status = 'active'
      and b.status = 'active'
      and p.active = true
      and p.account_status = 'active'
  );
$$;

create or replace function public.has_business_role(
  target_business_id uuid,
  allowed_roles public.business_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_memberships bm
    join public.businesses b on b.id = bm.business_id
    join public.profiles p on p.id = bm.profile_id
    where bm.business_id = target_business_id
      and bm.profile_id = (select auth.uid())
      and bm.status = 'active'
      and bm.role = any(allowed_roles)
      and b.status = 'active'
      and p.active = true
      and p.account_status = 'active'
  );
$$;

create or replace function public.has_business_permission(
  target_business_id uuid,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_business_role(
    target_business_id,
    array['primary_owner', 'co_owner']::public.business_role[]
  ) or exists (
    select 1
    from public.business_memberships bm
    join public.business_member_permissions bmp on bmp.membership_id = bm.id
    join public.businesses b on b.id = bm.business_id
    join public.profiles p on p.id = bm.profile_id
    where bm.business_id = target_business_id
      and bm.profile_id = (select auth.uid())
      and bm.status = 'active'
      and bm.role = 'staff'
      and bmp.permission = required_permission
      and b.status = 'active'
      and p.active = true
      and p.account_status = 'active'
  );
$$;

create or replace function public.has_active_support_session(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_admin() and exists (
    select 1
    from public.business_support_sessions s
    join public.businesses b on b.id = s.business_id
    where s.admin_profile_id = (select auth.uid())
      and s.business_id = target_business_id
      and s.access_level = 'configuration'
      and s.ended_at is null
      and s.started_at <= now()
      and s.expires_at > now()
      and b.status = 'active'
  );
$$;

create or replace function private.can_read_business(target_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and (
      public.is_business_member(target_business_id)
      or public.has_active_support_session(target_business_id)
    );
$$;

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
        array['primary_owner', 'co_owner']::public.business_role[]
      ) or public.has_active_support_session(target_business_id)
    );
$$;

create or replace function private.current_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_business_id uuid := private.requested_business_id();
begin
  if target_business_id is null or not private.can_read_business(target_business_id) then
    raise exception 'A valid authorized business context is required.' using errcode = '42501';
  end if;
  return target_business_id;
end;
$$;

create or replace function private.module_enabled(target_business_id uuid, target_module public.payment_business)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_modules m
    where m.business_id = target_business_id and m.module = target_module and m.enabled = true
  );
$$;

create or replace function private.can_collect_business(
  target_business_id uuid,
  target_module public.payment_business
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_business_id = private.requested_business_id()
    and private.module_enabled(target_business_id, target_module)
    and (
      public.has_business_role(
        target_business_id,
        array['primary_owner', 'co_owner']::public.business_role[]
      )
      or public.has_business_permission(
        target_business_id,
        case target_module
          when 'guest_house' then 'collect_guest_house'
          when 'library' then 'collect_library'
          when 'course' then 'collect_course'
          when 'general' then 'collect_general'
        end
      )
    );
$$;

create or replace function private.can_manage_membership(
  target_business_id uuid,
  target_role public.business_role
)
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
      )
      or public.has_active_support_session(target_business_id)
      or (
        public.has_business_role(target_business_id, array['co_owner']::public.business_role[])
        and target_role in ('staff', 'sales_agent')
      )
    );
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, public.business_role[]) to authenticated;
grant execute on function public.has_business_permission(uuid, text) to authenticated;
grant execute on function public.has_active_support_session(uuid) to authenticated;

create or replace function public.lenden_closing_summaries(p_closing_date date)
returns table (
  profile_id uuid,
  full_name text,
  role public.app_role,
  opening numeric,
  collected numeric,
  expenses numeric,
  received numeric,
  sent numeric,
  adjustments numeric,
  closing numeric
)
language sql
stable
as $$
  select
    p.id,
    p.full_name,
    (case bm.role
      when 'primary_owner' then 'admin'
      when 'co_owner' then 'owner'
      when 'sales_agent' then 'sales_agent'
      else 'staff'
    end)::public.app_role,
    coalesce(sum(le.amount) filter (where le.entry_date < p_closing_date), 0),
    coalesce(sum(le.amount) filter (where le.entry_date = p_closing_date and le.source_type = 'payment' and le.amount > 0), 0),
    coalesce(abs(sum(le.amount) filter (where le.entry_date = p_closing_date and le.source_type = 'expense' and le.amount < 0)), 0),
    coalesce(sum(le.amount) filter (where le.entry_date = p_closing_date and le.source_type in ('transfer', 'settlement') and le.amount > 0), 0),
    coalesce(abs(sum(le.amount) filter (where le.entry_date = p_closing_date and le.source_type in ('transfer', 'settlement') and le.amount < 0)), 0),
    coalesce(sum(le.amount) filter (where le.entry_date = p_closing_date and le.source_type = 'adjustment'), 0),
    coalesce(sum(le.amount), 0)
  from public.business_memberships bm
  join public.profiles p on p.id = bm.profile_id
  left join public.ledger_entries le
    on le.business_id = bm.business_id
   and le.account_profile_id = bm.profile_id
   and le.entry_date <= p_closing_date
  where bm.business_id = private.requested_business_id()
    and bm.status = 'active'
    and p.active = true
    and p.account_status = 'active'
  group by p.id, p.full_name, bm.role
  order by p.full_name;
$$;
grant execute on function public.lenden_closing_summaries(date) to authenticated;

-- Every existing tenant row must have been backfilled before enforcement.
do $$
declare
  table_name text;
  missing_count bigint;
begin
  foreach table_name in array array[
    'rooms', 'courses', 'referral_codes', 'payments', 'expenses',
    'money_movements', 'ledger_entries', 'record_change_requests',
    'agent_settlements', 'app_notifications', 'app_action_requests',
    'library_students', 'library_student_subscription_events'
  ] loop
    execute format('select count(*) from public.%I where business_id is null', table_name) into missing_count;
    if missing_count > 0 then
      raise exception 'Tenant backfill incomplete: %.% contains % rows without business_id', 'public', table_name, missing_count;
    end if;
  end loop;
end $$;

alter table public.rooms alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.courses alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.referral_codes alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.payments alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.expenses alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.money_movements alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.ledger_entries alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.record_change_requests alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.agent_settlements alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.app_notifications alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.app_action_requests alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.library_students alter column business_id set default private.current_business_id(), alter column business_id set not null;
alter table public.library_student_subscription_events alter column business_id set default private.current_business_id(), alter column business_id set not null;

-- Replace global uniqueness with tenant-scoped uniqueness.
alter table public.rooms drop constraint if exists rooms_room_number_key;
alter table public.courses drop constraint if exists courses_name_kind_key;
alter table public.referral_codes drop constraint if exists referral_codes_code_key;
alter table public.library_students drop constraint if exists library_students_roll_number_unique;
alter table public.library_student_subscription_events drop constraint if exists library_student_subscription_events_event_key_key;
alter table public.app_action_requests drop constraint if exists app_action_requests_user_id_action_name_request_key_key;

create unique index if not exists rooms_business_number_key on public.rooms (business_id, room_number);
create unique index if not exists courses_business_name_kind_key on public.courses (business_id, name, kind);
create unique index if not exists referral_codes_business_code_key on public.referral_codes (business_id, code);
create unique index if not exists library_students_business_roll_key on public.library_students (business_id, roll_number);
create unique index if not exists library_student_events_business_event_key on public.library_student_subscription_events (business_id, event_key);
create unique index if not exists app_action_requests_business_user_action_key on public.app_action_requests (business_id, user_id, action_name, request_key);

drop index if exists public.payments_collector_client_request_idx;
drop index if exists public.expenses_spender_client_request_idx;
drop index if exists public.money_movements_requester_client_request_idx;
drop index if exists public.record_change_requests_requester_client_request_idx;
drop index if exists public.agent_settlements_payer_client_request_idx;
drop index if exists public.app_notifications_recipient_event_key_idx;
drop index if exists public.ledger_entries_source_account_unique_idx;
drop index if exists public.record_change_requests_one_pending_cancel_idx;
drop index if exists public.money_movements_one_pending_payment_transfer_idx;

create unique index payments_business_collector_request_idx on public.payments (business_id, collected_by, client_request_id) where client_request_id is not null;
create unique index expenses_business_spender_request_idx on public.expenses (business_id, spent_by, client_request_id) where client_request_id is not null;
create unique index movements_business_requester_request_idx on public.money_movements (business_id, requested_by, client_request_id) where client_request_id is not null;
create unique index change_requests_business_requester_request_idx on public.record_change_requests (business_id, requested_by, client_request_id) where client_request_id is not null;
create unique index settlements_business_payer_request_idx on public.agent_settlements (business_id, paid_by, client_request_id) where client_request_id is not null;
create unique index notifications_business_recipient_event_idx on public.app_notifications (business_id, recipient_id, event_key) where event_key is not null;
create unique index ledger_business_source_account_idx on public.ledger_entries (business_id, source_type, source_id, account_profile_id) where source_id is not null and source_type in ('payment', 'expense', 'transfer', 'settlement');
create unique index change_requests_business_pending_cancel_idx on public.record_change_requests (business_id, record_type, record_id, request_type) where status = 'pending' and request_type = 'cancel';
create unique index movements_business_pending_payment_idx on public.money_movements (business_id, payment_id) where payment_id is not null and status = 'pending';

create unique index if not exists rooms_id_business_key on public.rooms (id, business_id);
create unique index if not exists courses_id_business_key on public.courses (id, business_id);
create unique index if not exists referrals_id_business_key on public.referral_codes (id, business_id);
create unique index if not exists payments_id_business_key on public.payments (id, business_id);
create unique index if not exists students_id_business_key on public.library_students (id, business_id);

-- Composite entity references prevent relationships crossing tenants.
alter table public.payments drop constraint if exists payments_room_id_fkey;
alter table public.payments drop constraint if exists payments_course_id_fkey;
alter table public.payments drop constraint if exists payments_skill_course_id_fkey;
alter table public.payments drop constraint if exists payments_referral_code_id_fkey;
alter table public.payments drop constraint if exists payments_library_student_id_fkey;
alter table public.money_movements drop constraint if exists money_movements_payment_id_fkey;
alter table public.library_students drop constraint if exists library_students_last_payment_id_fkey;
alter table public.library_student_subscription_events drop constraint if exists library_student_subscription_events_library_student_id_fkey;
alter table public.library_student_subscription_events drop constraint if exists library_student_subscription_events_payment_id_fkey;

alter table public.payments add constraint payments_room_business_fkey foreign key (room_id, business_id) references public.rooms(id, business_id) on delete restrict;
alter table public.payments add constraint payments_course_business_fkey foreign key (course_id, business_id) references public.courses(id, business_id) on delete restrict;
alter table public.payments add constraint payments_skill_course_business_fkey foreign key (skill_course_id, business_id) references public.courses(id, business_id) on delete restrict;
alter table public.payments add constraint payments_referral_business_fkey foreign key (referral_code_id, business_id) references public.referral_codes(id, business_id) on delete restrict;
alter table public.payments add constraint payments_student_business_fkey foreign key (library_student_id, business_id) references public.library_students(id, business_id) on delete restrict;
alter table public.money_movements add constraint movements_payment_business_fkey foreign key (payment_id, business_id) references public.payments(id, business_id) on delete cascade;
alter table public.library_students add constraint students_last_payment_business_fkey foreign key (last_payment_id, business_id) references public.payments(id, business_id) on delete restrict;
alter table public.library_student_subscription_events add constraint student_events_student_business_fkey foreign key (library_student_id, business_id) references public.library_students(id, business_id) on delete cascade;
alter table public.library_student_subscription_events add constraint student_events_payment_business_fkey foreign key (payment_id, business_id) references public.payments(id, business_id) on delete restrict;

-- Membership-backed profile references prove every actor belongs to the row's tenant.
alter table public.referral_codes add constraint referral_agent_membership_fkey foreign key (business_id, agent_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.payments add constraint payment_collector_membership_fkey foreign key (business_id, collected_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.payments add constraint payment_holder_membership_fkey foreign key (business_id, current_holder_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.payments add constraint payment_referral_agent_membership_fkey foreign key (business_id, referral_agent_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.expenses add constraint expense_spender_membership_fkey foreign key (business_id, spent_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.money_movements add constraint movement_from_membership_fkey foreign key (business_id, from_profile_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.money_movements add constraint movement_to_membership_fkey foreign key (business_id, to_profile_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.money_movements add constraint movement_requester_membership_fkey foreign key (business_id, requested_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.money_movements add constraint movement_responder_membership_fkey foreign key (business_id, responded_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.ledger_entries add constraint ledger_account_membership_fkey foreign key (business_id, account_profile_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.ledger_entries add constraint ledger_creator_membership_fkey foreign key (business_id, created_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.record_change_requests add constraint change_requester_membership_fkey foreign key (business_id, requested_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.record_change_requests add constraint change_reviewer_membership_fkey foreign key (business_id, reviewed_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.agent_settlements add constraint settlement_agent_membership_fkey foreign key (business_id, agent_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.agent_settlements add constraint settlement_payer_membership_fkey foreign key (business_id, paid_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.agent_settlements add constraint settlement_responder_membership_fkey foreign key (business_id, responded_by) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.app_notifications add constraint notification_recipient_membership_fkey foreign key (business_id, recipient_id) references public.business_memberships(business_id, profile_id) on delete restrict;
alter table public.library_student_subscription_events add constraint student_event_creator_membership_fkey foreign key (business_id, created_by) references public.business_memberships(business_id, profile_id) on delete restrict;

create index if not exists payments_business_date_tenant_idx on public.payments (business_id, payment_date desc);
create index if not exists expenses_business_date_tenant_idx on public.expenses (business_id, expense_date desc);
create index if not exists movements_business_created_tenant_idx on public.money_movements (business_id, created_at desc);
create index if not exists ledger_business_date_tenant_idx on public.ledger_entries (business_id, entry_date desc);
create index if not exists notifications_business_recipient_created_idx on public.app_notifications (business_id, recipient_id, created_at desc);

-- Audit records are append-only, including for service-role callers.
create or replace function private.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events are immutable';
end;
$$;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function private.prevent_audit_event_mutation();

alter table public.businesses enable row level security;
alter table public.business_modules enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_member_permissions enable row level security;
alter table public.business_invitations enable row level security;
alter table public.business_support_sessions enable row level security;
alter table public.audit_events enable row level security;

-- Remove every legacy policy on tables whose rows are now tenant-owned.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'profiles', 'staff_permissions', 'rooms', 'courses', 'referral_codes',
        'payments', 'expenses', 'money_movements', 'ledger_entries',
        'record_change_requests', 'agent_settlements', 'app_notifications',
        'app_action_requests', 'library_students', 'library_student_subscription_events',
        'businesses', 'business_modules', 'business_memberships',
        'business_member_permissions', 'business_invitations',
        'business_support_sessions', 'audit_events'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy profiles_select_business on public.profiles for select to authenticated using (
  id = (select auth.uid()) or public.is_platform_admin() or exists (
    select 1 from public.business_memberships target
    where target.profile_id = profiles.id
      and target.business_id = private.requested_business_id()
      and private.can_read_business(target.business_id)
  )
);
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy businesses_select_authorized on public.businesses for select to authenticated using (
  public.is_platform_admin() or public.is_business_member(id)
);
create policy businesses_insert_platform on public.businesses for insert to authenticated with check (public.is_platform_admin() and created_by = (select auth.uid()));
create policy businesses_update_config on public.businesses for update to authenticated using (
  public.is_platform_admin() or private.can_configure_business(id)
) with check (public.is_platform_admin() or private.can_configure_business(id));

create policy modules_select_authorized on public.business_modules for select to authenticated using (private.can_read_business(business_id));
create policy modules_insert_config on public.business_modules for insert to authenticated with check (private.can_configure_business(business_id));
create policy modules_update_config on public.business_modules for update to authenticated using (private.can_configure_business(business_id)) with check (private.can_configure_business(business_id));

create policy memberships_select_authorized on public.business_memberships for select to authenticated using (
  profile_id = (select auth.uid()) or public.is_platform_admin() or private.can_read_business(business_id)
);
create policy memberships_insert_managed on public.business_memberships for insert to authenticated with check (
  private.can_manage_membership(business_id, role) and role <> 'primary_owner'
);
create policy memberships_update_managed on public.business_memberships for update to authenticated using (
  private.can_manage_membership(business_id, role) and role <> 'primary_owner'
) with check (private.can_manage_membership(business_id, role) and role <> 'primary_owner');

create policy member_permissions_select on public.business_member_permissions for select to authenticated using (
  exists (select 1 from public.business_memberships bm where bm.id = membership_id and (bm.profile_id = (select auth.uid()) or private.can_read_business(bm.business_id)))
);
create policy member_permissions_insert on public.business_member_permissions for insert to authenticated with check (
  exists (select 1 from public.business_memberships bm where bm.id = membership_id and bm.role = 'staff' and private.can_manage_membership(bm.business_id, bm.role))
);
create policy member_permissions_delete on public.business_member_permissions for delete to authenticated using (
  exists (select 1 from public.business_memberships bm where bm.id = membership_id and bm.role = 'staff' and private.can_manage_membership(bm.business_id, bm.role))
);

create policy invitations_select_managed on public.business_invitations for select to authenticated using (
  lower(email) = lower(coalesce((select p.email from public.profiles p where p.id = (select auth.uid())), ''))
  or private.can_manage_membership(business_id, intended_role)
);
create policy invitations_insert_managed on public.business_invitations for insert to authenticated with check (
  invited_by = (select auth.uid()) and private.can_manage_membership(business_id, intended_role) and intended_role <> 'primary_owner'
);
create policy invitations_update_managed on public.business_invitations for update to authenticated using (
  private.can_manage_membership(business_id, intended_role)
) with check (private.can_manage_membership(business_id, intended_role));

create policy support_sessions_select_admin on public.business_support_sessions for select to authenticated using (
  admin_profile_id = (select auth.uid()) and public.is_platform_admin()
);
create policy support_sessions_insert_admin on public.business_support_sessions for insert to authenticated with check (
  admin_profile_id = (select auth.uid()) and public.is_platform_admin() and expires_at <= started_at + interval '30 minutes'
);
create policy support_sessions_update_admin on public.business_support_sessions for update to authenticated using (
  admin_profile_id = (select auth.uid()) and public.is_platform_admin()
) with check (admin_profile_id = (select auth.uid()) and public.is_platform_admin());

create policy audit_events_select_authorized on public.audit_events for select to authenticated using (
  public.is_platform_admin() or (
    business_id = private.requested_business_id()
    and public.has_business_role(business_id, array['primary_owner']::public.business_role[])
  )
);
create policy audit_events_insert_actor on public.audit_events for insert to authenticated with check (
  actor_profile_id = (select auth.uid())
  and business_id = private.requested_business_id()
  and (public.is_platform_admin() or public.is_business_member(business_id))
);

create policy rooms_select_tenant on public.rooms for select to authenticated using (private.can_read_business(business_id));
create policy rooms_insert_config on public.rooms for insert to authenticated with check (private.can_configure_business(business_id));
create policy rooms_update_config on public.rooms for update to authenticated using (private.can_configure_business(business_id)) with check (private.can_configure_business(business_id));
create policy rooms_delete_config on public.rooms for delete to authenticated using (private.can_configure_business(business_id));
create policy courses_select_tenant on public.courses for select to authenticated using (private.can_read_business(business_id));
create policy courses_insert_config on public.courses for insert to authenticated with check (private.can_configure_business(business_id));
create policy courses_update_config on public.courses for update to authenticated using (private.can_configure_business(business_id)) with check (private.can_configure_business(business_id));
create policy courses_delete_config on public.courses for delete to authenticated using (private.can_configure_business(business_id));
create policy referrals_select_tenant on public.referral_codes for select to authenticated using (
  private.can_read_business(business_id) and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or (public.has_business_role(business_id, array['staff']::public.business_role[]) and active = true)
    or agent_id = (select auth.uid())
  )
);
create policy referrals_insert_config on public.referral_codes for insert to authenticated with check (private.can_configure_business(business_id));
create policy referrals_update_config on public.referral_codes for update to authenticated using (private.can_configure_business(business_id)) with check (private.can_configure_business(business_id));
create policy referrals_delete_config on public.referral_codes for delete to authenticated using (private.can_configure_business(business_id));

create policy payments_select_tenant on public.payments for select to authenticated using (
  private.can_read_business(business_id) and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or collected_by = (select auth.uid())
    or current_holder_id = (select auth.uid())
    or referral_agent_id = (select auth.uid())
    or private.can_collect_business(business_id, business_type)
  )
);
create policy payments_insert_tenant on public.payments for insert to authenticated with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and private.can_collect_business(business_id, business_type)
  and collected_by = (select auth.uid())
  and (current_holder_id is null or current_holder_id = (select auth.uid()))
);
create policy payments_update_tenant on public.payments for update to authenticated using (
  not public.has_active_support_session(business_id) and (
    public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or (collected_by = (select auth.uid()) and approval_status <> 'approved')
    or current_holder_id = (select auth.uid())
  )
) with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id)
);

create policy expenses_select_tenant on public.expenses for select to authenticated using (
  private.can_read_business(business_id) and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or spent_by = (select auth.uid())
    or public.has_business_permission(business_id, 'add_expense')
  )
);
create policy expenses_insert_tenant on public.expenses for insert to authenticated with check (
  business_id = private.requested_business_id()
  and not public.has_active_support_session(business_id)
  and spent_by = (select auth.uid())
  and public.has_business_permission(business_id, 'add_expense')
  and (business_type is null or private.module_enabled(business_id, business_type))
);
create policy expenses_update_tenant on public.expenses for update to authenticated using (
  not public.has_active_support_session(business_id) and (
    public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or (spent_by = (select auth.uid()) and approval_status <> 'approved')
  )
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));

create policy movements_select_tenant on public.money_movements for select to authenticated using (
  private.can_read_business(business_id) and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or from_profile_id = (select auth.uid()) or to_profile_id = (select auth.uid())
  )
);
create policy movements_insert_tenant on public.money_movements for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id) and (
    public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or (requested_by = (select auth.uid()) and from_profile_id = (select auth.uid()) and public.has_business_permission(business_id, 'transfer_money'))
  )
);
create policy movements_update_tenant on public.money_movements for update to authenticated using (
  not public.has_active_support_session(business_id) and (
    public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or to_profile_id = (select auth.uid())
  )
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));

create policy ledger_select_tenant on public.ledger_entries for select to authenticated using (
  private.can_read_business(business_id) and (
    public.has_active_support_session(business_id)
    or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
    or account_profile_id = (select auth.uid())
  )
);
create policy ledger_insert_tenant on public.ledger_entries for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id)
  and created_by = (select auth.uid()) and public.is_business_member(business_id)
);
create policy ledger_delete_owner on public.ledger_entries for delete to authenticated using (
  not public.has_active_support_session(business_id)
  and business_id = private.requested_business_id()
  and public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
);

create policy changes_select_tenant on public.record_change_requests for select to authenticated using (
  private.can_read_business(business_id) and (public.has_active_support_session(business_id) or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[]) or requested_by = (select auth.uid()))
);
create policy changes_insert_tenant on public.record_change_requests for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id) and requested_by = (select auth.uid()) and public.is_business_member(business_id)
);
create policy changes_update_owner on public.record_change_requests for update to authenticated using (
  not public.has_active_support_session(business_id) and public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));

create policy settlements_select_tenant on public.agent_settlements for select to authenticated using (
  private.can_read_business(business_id) and (public.has_active_support_session(business_id) or public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[]) or agent_id = (select auth.uid()))
);
create policy settlements_insert_owner on public.agent_settlements for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id) and public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[])
);
create policy settlements_update_tenant on public.agent_settlements for update to authenticated using (
  not public.has_active_support_session(business_id) and (public.has_business_role(business_id, array['primary_owner', 'co_owner']::public.business_role[]) or agent_id = (select auth.uid()))
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));

create policy notifications_select_own on public.app_notifications for select to authenticated using (
  business_id = private.requested_business_id() and recipient_id = (select auth.uid()) and private.can_read_business(business_id)
);
create policy notifications_insert_member on public.app_notifications for insert to authenticated with check (
  business_id = private.requested_business_id()
  and (public.is_business_member(business_id) or public.has_active_support_session(business_id))
  and (actor_id is null or actor_id = (select auth.uid()))
);
create policy notifications_update_own on public.app_notifications for update to authenticated using (
  business_id = private.requested_business_id() and recipient_id = (select auth.uid())
) with check (business_id = private.requested_business_id() and recipient_id = (select auth.uid()));

create policy action_requests_own on public.app_action_requests for all to authenticated using (
  business_id = private.requested_business_id() and user_id = (select auth.uid())
  and (public.is_business_member(business_id) or public.has_active_support_session(business_id))
) with check (
  business_id = private.requested_business_id() and user_id = (select auth.uid())
  and (public.is_business_member(business_id) or public.has_active_support_session(business_id))
);

create policy students_select_tenant on public.library_students for select to authenticated using (
  private.can_read_business(business_id) and (public.has_active_support_session(business_id) or private.can_collect_business(business_id, 'library'))
);
create policy students_insert_tenant on public.library_students for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id) and private.can_collect_business(business_id, 'library')
);
create policy students_update_tenant on public.library_students for update to authenticated using (
  not public.has_active_support_session(business_id) and private.can_collect_business(business_id, 'library')
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));
create policy student_events_select_tenant on public.library_student_subscription_events for select to authenticated using (
  private.can_read_business(business_id) and (public.has_active_support_session(business_id) or private.can_collect_business(business_id, 'library'))
);
create policy student_events_insert_tenant on public.library_student_subscription_events for insert to authenticated with check (
  business_id = private.requested_business_id() and not public.has_active_support_session(business_id) and private.can_collect_business(business_id, 'library')
);
create policy student_events_update_tenant on public.library_student_subscription_events for update to authenticated using (
  not public.has_active_support_session(business_id) and private.can_collect_business(business_id, 'library')
) with check (business_id = private.requested_business_id() and not public.has_active_support_session(business_id));

-- Legacy permissions are readable only by the profile during rollout and can no
-- longer authorize any tenant operation.
create policy staff_permissions_legacy_self on public.staff_permissions for select to authenticated using (profile_id = (select auth.uid()));

-- Keep identity fields safe from tenant managers. Global account changes use the
-- audited service-role path; normal users may edit only their display identity.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, last_business_id) on public.profiles to authenticated;

-- Atomic primary ownership transfer. The target must already be an active co-owner.
create or replace function public.transfer_primary_ownership(target_business_id uuid, target_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  previous_primary uuid;
begin
  if target_business_id <> private.requested_business_id()
    or not public.has_business_role(target_business_id, array['primary_owner']::public.business_role[]) then
    raise exception 'Only the primary owner can transfer ownership.' using errcode = '42501';
  end if;

  select profile_id into previous_primary
  from public.business_memberships
  where business_id = target_business_id and role = 'primary_owner' and status = 'active'
  for update;

  if not exists (
    select 1 from public.business_memberships
    where business_id = target_business_id and profile_id = target_profile_id
      and role = 'co_owner' and status = 'active'
  ) then
    raise exception 'The new primary owner must be an active co-owner.' using errcode = '23514';
  end if;

  update public.business_memberships set role = 'co_owner' where business_id = target_business_id and profile_id = previous_primary;
  update public.business_memberships set role = 'primary_owner' where business_id = target_business_id and profile_id = target_profile_id;

  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id, before_data, after_data)
  values (
    target_business_id, actor_id, 'primary_ownership_transferred', 'business', target_business_id,
    jsonb_build_object('primary_owner_id', previous_primary),
    jsonb_build_object('primary_owner_id', target_profile_id)
  );
end;
$$;
grant execute on function public.transfer_primary_ownership(uuid, uuid) to authenticated;

create or replace function public.platform_recover_primary_ownership(
  target_business_id uuid,
  target_profile_id uuid,
  recovery_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  previous_primary uuid;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access is required.' using errcode = '42501'; end if;
  if char_length(btrim(recovery_reason)) < 10 then raise exception 'A detailed recovery reason is required.' using errcode = '22023'; end if;

  perform 1 from public.business_memberships where business_id = target_business_id for update;
  select profile_id into previous_primary from public.business_memberships
  where business_id = target_business_id and role = 'primary_owner' and status = 'active';
  if not exists (
    select 1 from public.business_memberships
    where business_id = target_business_id and profile_id = target_profile_id
      and role = 'co_owner' and status = 'active'
  ) then
    raise exception 'Recovery target must be an active co-owner.' using errcode = '23514';
  end if;

  update public.business_memberships set role = 'co_owner'
  where business_id = target_business_id and role = 'primary_owner' and status = 'active';
  update public.business_memberships set role = 'primary_owner'
  where business_id = target_business_id and profile_id = target_profile_id and status = 'active';

  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id, reason, before_data, after_data)
  values (
    target_business_id, actor_id, 'platform_primary_owner_recovery', 'business', target_business_id,
    recovery_reason,
    jsonb_build_object('primary_owner_id', previous_primary),
    jsonb_build_object('primary_owner_id', target_profile_id)
  );
end;
$$;
grant execute on function public.platform_recover_primary_ownership(uuid, uuid, text) to authenticated;

create or replace function public.accept_business_invitation(invitation_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation public.business_invitations%rowtype;
  new_membership_id uuid;
  actor_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select email into actor_email from public.profiles where id = auth.uid() and active = true and account_status = 'active';

  select * into invitation
  from public.business_invitations
  where token_hash = invitation_token_hash
  for update;

  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null then
    raise exception 'Invitation is invalid or no longer active.' using errcode = '22023';
  end if;
  if invitation.expires_at <= now() then raise exception 'Invitation has expired.' using errcode = '22023'; end if;
  if lower(invitation.email) <> lower(actor_email) then raise exception 'This invitation belongs to another email address.' using errcode = '42501'; end if;
  if invitation.intended_role = 'primary_owner' and exists (
    select 1 from public.business_memberships where business_id = invitation.business_id and role = 'primary_owner' and status = 'active'
  ) then
    raise exception 'This business already has an active primary owner.' using errcode = '23505';
  end if;

  insert into public.business_memberships (business_id, profile_id, role, status, invited_by, invited_at, joined_at)
  values (invitation.business_id, auth.uid(), invitation.intended_role, 'active', invitation.invited_by, invitation.created_at, now())
  on conflict (business_id, profile_id) do update
  set role = excluded.role, status = 'active', suspended_at = null, joined_at = now(), updated_at = now()
  returning id into new_membership_id;

  if invitation.intended_role = 'staff' and cardinality(invitation.permissions) > 0 then
    insert into public.business_member_permissions (membership_id, permission, granted_by)
    select new_membership_id, permission, invitation.invited_by from unnest(invitation.permissions) permission
    on conflict (membership_id, permission) do nothing;
  end if;

  update public.business_invitations set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  update public.profiles set last_business_id = invitation.business_id where id = auth.uid();
  insert into public.audit_events (business_id, actor_profile_id, event_type, entity_type, entity_id, after_data)
  values (invitation.business_id, auth.uid(), 'invitation_accepted', 'business_membership', new_membership_id, jsonb_build_object('role', invitation.intended_role));
  return invitation.business_id;
end;
$$;
grant execute on function public.accept_business_invitation(text) to authenticated;

-- Validate polymorphic change-request targets without trusting submitted tenant ids.
create or replace function private.validate_change_request_business()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.record_type = 'payment' and not exists (select 1 from public.payments p where p.id = new.record_id and p.business_id = new.business_id) then
    raise exception 'Payment does not belong to this business.' using errcode = '23503';
  elsif new.record_type = 'expense' and not exists (select 1 from public.expenses e where e.id = new.record_id and e.business_id = new.business_id) then
    raise exception 'Expense does not belong to this business.' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_change_request_business on public.record_change_requests;
create trigger validate_change_request_business before insert or update on public.record_change_requests
for each row execute function private.validate_change_request_business();

-- Tenant-scoped private storage. New object names begin with business_id.
update storage.buckets set public = false where id in ('receipts', 'library-student-photos', 'profile-photos');

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in (
        'receipt_authenticated_uploads', 'receipt_authenticated_reads',
        'library_student_photo_public_reads', 'library_student_photo_owner_uploads',
        'library_student_photo_owner_updates', 'library_student_photo_owner_deletes',
        'profile_photo_public_reads', 'profile_photo_owner_uploads',
        'profile_photo_owner_updates', 'profile_photo_owner_deletes'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end $$;

create policy tenant_files_read on storage.objects for select to authenticated using (
  bucket_id in ('receipts', 'library-student-photos', 'profile-photos')
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.can_read_business(((storage.foldername(name))[1])::uuid)
);
create policy tenant_files_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('receipts', 'library-student-photos', 'profile-photos')
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and public.is_business_member(private.requested_business_id())
);
create policy tenant_files_update on storage.objects for update to authenticated using (
  bucket_id in ('receipts', 'library-student-photos', 'profile-photos')
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and public.is_business_member(private.requested_business_id())
) with check (
  bucket_id in ('receipts', 'library-student-photos', 'profile-photos')
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and public.is_business_member(private.requested_business_id())
);
create policy tenant_files_delete on storage.objects for delete to authenticated using (
  bucket_id in ('receipts', 'library-student-photos', 'profile-photos')
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and private.can_configure_business(private.requested_business_id())
);
