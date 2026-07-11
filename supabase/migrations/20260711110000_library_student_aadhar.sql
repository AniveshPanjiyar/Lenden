alter table public.library_students
  add column if not exists aadhar_number text,
  add column if not exists aadhar_photo_url text;

