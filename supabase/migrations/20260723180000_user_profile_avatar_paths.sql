-- Global user avatars live outside any one business. Existing business-prefixed
-- paths remain readable through tenant_files_read and require no backfill.
update storage.buckets
set public = false
where id = 'profile-photos';

create or replace function private.can_read_profile_avatar(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_profile_id = (select auth.uid())
    or exists (
      select 1
      from public.business_memberships target_membership
      where target_membership.profile_id = target_profile_id
        and target_membership.status = 'active'
        and private.can_read_business(target_membership.business_id)
    );
$$;

revoke all on function private.can_read_profile_avatar(uuid) from public;
grant execute on function private.can_read_profile_avatar(uuid) to authenticated, service_role;

drop policy if exists user_profile_photos_read on storage.objects;
create policy user_profile_photos_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.can_read_profile_avatar(((storage.foldername(name))[2])::uuid)
);

drop policy if exists user_profile_photos_insert on storage.objects;
create policy user_profile_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists user_profile_photos_update on storage.objects;
create policy user_profile_photos_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists user_profile_photos_delete on storage.objects;
create policy user_profile_photos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
