create table if not exists public.app_action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_name text not null,
  request_key text not null,
  request_fingerprint text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, action_name, request_key)
);

create index if not exists app_action_requests_user_created_idx
  on public.app_action_requests (user_id, created_at desc);

alter table public.app_action_requests enable row level security;

drop policy if exists "app_action_requests_owner_only" on public.app_action_requests;
create policy "app_action_requests_owner_only" on public.app_action_requests
for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter table public.payments
  add column if not exists client_request_id text;

alter table public.expenses
  add column if not exists client_request_id text;

alter table public.money_movements
  add column if not exists client_request_id text;

alter table public.record_change_requests
  add column if not exists client_request_id text;

alter table public.agent_settlements
  add column if not exists client_request_id text;

alter table public.app_notifications
  add column if not exists event_key text;

create unique index if not exists payments_collector_client_request_idx
  on public.payments (collected_by, client_request_id)
  where client_request_id is not null;

create unique index if not exists expenses_spender_client_request_idx
  on public.expenses (spent_by, client_request_id)
  where client_request_id is not null;

create unique index if not exists money_movements_requester_client_request_idx
  on public.money_movements (requested_by, client_request_id)
  where client_request_id is not null;

create unique index if not exists record_change_requests_requester_client_request_idx
  on public.record_change_requests (requested_by, client_request_id)
  where client_request_id is not null;

create unique index if not exists agent_settlements_payer_client_request_idx
  on public.agent_settlements (paid_by, client_request_id)
  where client_request_id is not null;

create unique index if not exists app_notifications_recipient_event_key_idx
  on public.app_notifications (recipient_id, event_key)
  where event_key is not null;

create unique index if not exists ledger_entries_source_account_unique_idx
  on public.ledger_entries (source_type, source_id, account_profile_id)
  where source_id is not null
    and source_type in ('payment', 'expense', 'transfer', 'settlement');

create unique index if not exists record_change_requests_one_pending_cancel_idx
  on public.record_change_requests (record_type, record_id, request_type)
  where status = 'pending'
    and request_type = 'cancel';
