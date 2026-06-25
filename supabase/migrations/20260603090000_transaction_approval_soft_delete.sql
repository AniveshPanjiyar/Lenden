alter table public.expenses
  add column if not exists cancel_reason text;

delete from public.ledger_entries ledger
using public.payments payment
where ledger.source_type = 'payment'
  and ledger.source_id = payment.id
  and (payment.approval_status <> 'approved' or payment.record_status <> 'active');

delete from public.ledger_entries ledger
using public.expenses expense
where ledger.source_type = 'expense'
  and ledger.source_id = expense.id
  and (expense.approval_status <> 'approved' or expense.record_status <> 'active');

delete from public.ledger_entries ledger
where ledger.source_type = 'adjustment'
  and (
    exists (
      select 1
      from public.payments payment
      where payment.id = ledger.source_id
        and (payment.approval_status in ('cancelled', 'rejected') or payment.record_status <> 'active')
    )
    or exists (
      select 1
      from public.expenses expense
      where expense.id = ledger.source_id
        and (expense.approval_status in ('cancelled', 'rejected') or expense.record_status <> 'active')
    )
  );

create index if not exists payments_record_status_idx on public.payments (record_status, approval_status);
create index if not exists expenses_record_status_idx on public.expenses (record_status, approval_status);
