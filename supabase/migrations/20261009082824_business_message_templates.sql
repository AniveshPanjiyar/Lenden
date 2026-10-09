-- Owner-defined WhatsApp message templates, e.g. {"student_expired": "...", "student_active": "..."}.
-- Empty until the owner sets them; the app then opens WhatsApp with an empty message.
alter table public.businesses
  add column if not exists message_templates jsonb not null default '{}'::jsonb;
