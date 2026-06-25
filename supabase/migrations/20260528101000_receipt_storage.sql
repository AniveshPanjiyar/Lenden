insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipt_authenticated_uploads" on storage.objects;
create policy "receipt_authenticated_uploads" on storage.objects
for insert to authenticated
with check (bucket_id = 'receipts');

drop policy if exists "receipt_authenticated_reads" on storage.objects;
create policy "receipt_authenticated_reads" on storage.objects
for select to authenticated
using (bucket_id = 'receipts');
