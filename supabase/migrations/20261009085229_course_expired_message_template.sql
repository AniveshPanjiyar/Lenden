-- Per-course WhatsApp text for students whose course subscription has expired.
-- Empty = fall back to the business "Expired students" template (or a blank message).
alter table public.courses
  add column if not exists expired_message_template text;
