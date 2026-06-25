create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  title text not null,
  body text not null,
  category text not null default 'system'
    check (category in ('payment', 'expense', 'transfer', 'approval', 'agent', 'settings', 'system')),
  tone text not null default 'info'
    check (tone in ('success', 'error', 'warning', 'info')),
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_recipient_created_idx
  on public.app_notifications (recipient_id, created_at desc);

create index if not exists app_notifications_recipient_unread_idx
  on public.app_notifications (recipient_id, read_at)
  where read_at is null;

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own" on public.app_notifications
for select
to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own" on public.app_notifications
for update
to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
