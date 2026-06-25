alter type public.payment_mode add value if not exists 'mixed';

alter table public.payments
  add column if not exists cash_collection numeric(12,2) not null default 0 check (cash_collection >= 0),
  add column if not exists online_collection numeric(12,2) not null default 0 check (online_collection >= 0);

update public.payments
set
  cash_collection = case when mode = 'cash' then amount else 0 end,
  online_collection = case when mode = 'online' then amount else 0 end
where cash_collection = 0
  and online_collection = 0;

alter table public.payments
  drop constraint if exists payments_collection_split_matches_mode,
  add constraint payments_collection_split_matches_mode check (
    (mode::text = 'cash' and cash_collection = amount and online_collection = 0)
    or (mode::text = 'online' and cash_collection = 0 and online_collection = amount)
    or (mode::text = 'mixed' and cash_collection > 0 and online_collection > 0 and cash_collection + online_collection = amount)
  );
