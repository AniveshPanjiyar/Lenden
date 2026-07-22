-- Give durable course-student records the same user-owned profile fields as
-- library students. Existing records intentionally remain nullable so staff
-- can complete them from the student profile instead of guessing from history.

alter table public.course_students
  add column if not exists photo_url text,
  add column if not exists phone_number text,
  add column if not exists address text,
  add column if not exists aadhar_number text;

