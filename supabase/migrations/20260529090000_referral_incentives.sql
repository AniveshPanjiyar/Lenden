alter table public.referral_codes
  add column if not exists discount_type text not null default 'amount' check (discount_type in ('amount', 'percentage')),
  add column if not exists discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  add column if not exists incentive_type text not null default 'amount' check (incentive_type in ('amount', 'percentage')),
  add column if not exists incentive_value numeric(12,2) not null default 0 check (incentive_value >= 0);

update public.referral_codes
set discount_value = discount_amount
where discount_value = 0 and discount_amount > 0;

alter table public.payments
  add column if not exists referral_agent_id uuid references public.profiles(id) on delete set null,
  add column if not exists discount_amount_applied numeric(12,2) not null default 0 check (discount_amount_applied >= 0),
  add column if not exists incentive_amount numeric(12,2) not null default 0 check (incentive_amount >= 0);

create index if not exists payments_referral_agent_id_idx on public.payments (referral_agent_id);

create table if not exists public.agent_settlements (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  status public.movement_status not null default 'pending',
  paid_by uuid not null references public.profiles(id),
  responded_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists agent_settlements_agent_id_idx on public.agent_settlements (agent_id);
create index if not exists agent_settlements_paid_by_idx on public.agent_settlements (paid_by);
create index if not exists agent_settlements_status_idx on public.agent_settlements (status);

alter table public.agent_settlements enable row level security;

drop policy if exists "agent_settlements_select_visible" on public.agent_settlements;
create policy "agent_settlements_select_visible" on public.agent_settlements
for select to authenticated
using (private.is_ownerish() or agent_id = (select auth.uid()));

drop policy if exists "agent_settlements_owner_insert" on public.agent_settlements;
create policy "agent_settlements_owner_insert" on public.agent_settlements
for insert to authenticated
with check (private.is_ownerish());

drop policy if exists "agent_settlements_update_visible" on public.agent_settlements;
create policy "agent_settlements_update_visible" on public.agent_settlements
for update to authenticated
using (private.is_ownerish() or agent_id = (select auth.uid()))
with check (private.is_ownerish() or agent_id = (select auth.uid()));

drop policy if exists "payments_select_visible" on public.payments;
create policy "payments_select_visible" on public.payments
for select to authenticated
using (
  private.is_ownerish()
  or collected_by = (select auth.uid())
  or current_holder_id = (select auth.uid())
  or referral_agent_id = (select auth.uid())
  or exists (
    select 1 from public.referral_codes rc
    where rc.id = referral_code_id and rc.agent_id = (select auth.uid())
  )
);
