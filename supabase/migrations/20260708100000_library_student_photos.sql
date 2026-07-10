alter table public.library_students
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('library-student-photos', 'library-student-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "library_student_photo_public_reads" on storage.objects;
create policy "library_student_photo_public_reads" on storage.objects
for select
to public
using (bucket_id = 'library-student-photos');

drop policy if exists "library_student_photo_owner_uploads" on storage.objects;
create policy "library_student_photo_owner_uploads" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'library-student-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "library_student_photo_owner_updates" on storage.objects;
create policy "library_student_photo_owner_updates" on storage.objects
for update
to authenticated
using (
  bucket_id = 'library-student-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'library-student-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "library_student_photo_owner_deletes" on storage.objects;
create policy "library_student_photo_owner_deletes" on storage.objects
for delete
to authenticated
using (
  bucket_id = 'library-student-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
