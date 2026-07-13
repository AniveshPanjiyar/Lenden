alter table public.library_students
  add column if not exists aadhar_back_photo_url text;

alter table public.payments
  add column if not exists aadhar_photo_url text,
  add column if not exists aadhar_back_photo_url text;
