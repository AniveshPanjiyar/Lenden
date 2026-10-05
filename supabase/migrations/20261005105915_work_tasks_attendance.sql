-- Work module: one-tap daily attendance, a shared task board and a dated work
-- log (text, photo, voice). Every member of a business can read all of it;
-- members write only as themselves.

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.current_business_id()
    references public.businesses(id) on delete restrict,
  title text not null,
  notes text,
  assigned_to uuid not null,
  created_by uuid not null,
  due_date date,
  status text not null default 'todo',
  completed_at timestamptz,
  client_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint work_tasks_status_check check (status in ('todo', 'in_progress', 'done')),
  constraint work_tasks_assignee_membership_fkey foreign key (business_id, assigned_to)
    references public.business_memberships (business_id, profile_id) on delete restrict,
  constraint work_tasks_creator_membership_fkey foreign key (business_id, created_by)
    references public.business_memberships (business_id, profile_id) on delete restrict
);

create unique index if not exists work_tasks_id_business_key on public.work_tasks (id, business_id);
create unique index if not exists work_tasks_client_request_key
  on public.work_tasks (business_id, created_by, client_request_id) where client_request_id is not null;
create index if not exists work_tasks_business_status_due_idx on public.work_tasks (business_id, status, due_date);

create table if not exists public.work_updates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.current_business_id()
    references public.businesses(id) on delete restrict,
  task_id uuid,
  author_id uuid not null,
  entry_date date not null,
  body text,
  photo_path text,
  voice_path text,
  voice_seconds integer,
  status_change text,
  client_request_id text,
  created_at timestamptz not null default now(),
  constraint work_updates_content_present check (
    nullif(btrim(coalesce(body, '')), '') is not null or photo_path is not null or voice_path is not null
  ),
  constraint work_updates_status_change_check check (status_change is null or status_change in ('todo', 'in_progress', 'done')),
  constraint work_updates_voice_seconds_check check (voice_seconds is null or voice_seconds between 0 and 600),
  constraint work_updates_task_fkey foreign key (task_id, business_id)
    references public.work_tasks (id, business_id) on delete cascade,
  constraint work_updates_author_membership_fkey foreign key (business_id, author_id)
    references public.business_memberships (business_id, profile_id) on delete restrict
);

create unique index if not exists work_updates_client_request_key
  on public.work_updates (business_id, author_id, client_request_id) where client_request_id is not null;
create index if not exists work_updates_business_date_idx on public.work_updates (business_id, entry_date, created_at desc);
create index if not exists work_updates_task_idx on public.work_updates (task_id) where task_id is not null;

create table if not exists public.work_attendance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null default private.current_business_id()
    references public.businesses(id) on delete restrict,
  profile_id uuid not null,
  attendance_date date not null,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_attendance_one_per_day unique (business_id, profile_id, attendance_date),
  constraint work_attendance_time_order check (check_out_at is null or check_out_at >= check_in_at),
  constraint work_attendance_membership_fkey foreign key (business_id, profile_id)
    references public.business_memberships (business_id, profile_id) on delete restrict
);

create index if not exists work_attendance_business_date_idx on public.work_attendance (business_id, attendance_date);

drop trigger if exists touch_work_tasks_updated_at on public.work_tasks;
create trigger touch_work_tasks_updated_at before update on public.work_tasks
for each row execute function public.touch_updated_at();

drop trigger if exists touch_work_attendance_updated_at on public.work_attendance;
create trigger touch_work_attendance_updated_at before update on public.work_attendance
for each row execute function public.touch_updated_at();

alter table public.work_tasks enable row level security;
alter table public.work_updates enable row level security;
alter table public.work_attendance enable row level security;

drop policy if exists work_tasks_select_member on public.work_tasks;
create policy work_tasks_select_member on public.work_tasks for select to authenticated
using (private.can_read_business(business_id));

drop policy if exists work_tasks_insert_member on public.work_tasks;
create policy work_tasks_insert_member on public.work_tasks for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and public.is_business_member(business_id)
  and not public.has_active_support_session(business_id)
  and created_by = auth.uid()
);

drop policy if exists work_tasks_update_member on public.work_tasks;
create policy work_tasks_update_member on public.work_tasks for update to authenticated
using (
  business_id = private.requested_business_id()
  and public.is_business_member(business_id)
  and not public.has_active_support_session(business_id)
)
with check (
  business_id = private.requested_business_id()
  and public.is_business_member(business_id)
  and not public.has_active_support_session(business_id)
);

drop policy if exists work_updates_select_member on public.work_updates;
create policy work_updates_select_member on public.work_updates for select to authenticated
using (private.can_read_business(business_id));

drop policy if exists work_updates_insert_own on public.work_updates;
create policy work_updates_insert_own on public.work_updates for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and public.is_business_member(business_id)
  and not public.has_active_support_session(business_id)
  and author_id = auth.uid()
);

drop policy if exists work_updates_delete_own on public.work_updates;
create policy work_updates_delete_own on public.work_updates for delete to authenticated
using (
  business_id = private.requested_business_id()
  and author_id = auth.uid()
  and not public.has_active_support_session(business_id)
);

drop policy if exists work_attendance_select_member on public.work_attendance;
create policy work_attendance_select_member on public.work_attendance for select to authenticated
using (private.can_read_business(business_id));

drop policy if exists work_attendance_insert_own on public.work_attendance;
create policy work_attendance_insert_own on public.work_attendance for insert to authenticated
with check (
  business_id = private.requested_business_id()
  and public.is_business_member(business_id)
  and not public.has_active_support_session(business_id)
  and profile_id = auth.uid()
);

drop policy if exists work_attendance_update_own on public.work_attendance;
create policy work_attendance_update_own on public.work_attendance for update to authenticated
using (
  business_id = private.requested_business_id()
  and profile_id = auth.uid()
  and not public.has_active_support_session(business_id)
)
with check (
  business_id = private.requested_business_id()
  and profile_id = auth.uid()
  and not public.has_active_support_session(business_id)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-media', 'work-media', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists work_media_read on storage.objects;
create policy work_media_read on storage.objects for select to authenticated using (
  bucket_id = 'work-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.can_read_business(((storage.foldername(name))[1])::uuid)
);

drop policy if exists work_media_insert on storage.objects;
create policy work_media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'work-media'
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and public.is_business_member(private.requested_business_id())
  and not public.has_active_support_session(private.requested_business_id())
);

drop policy if exists work_media_delete_own on storage.objects;
create policy work_media_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'work-media'
  and (storage.foldername(name))[1] = private.requested_business_id()::text
  and owner_id = (select auth.uid())::text
);

alter table public.app_notifications drop constraint if exists app_notifications_category_check;
alter table public.app_notifications add constraint app_notifications_category_check
  check (category in ('payment', 'expense', 'transfer', 'approval', 'agent', 'settings', 'system', 'task'));
