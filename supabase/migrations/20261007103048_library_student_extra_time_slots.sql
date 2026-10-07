-- Library students may book more than one daily slot. The first slot stays in start_time /
-- end_time; any further slots are stored here as [{"start": "HH:MM", "end": "HH:MM"}].
alter table public.library_students
  add column if not exists extra_time_slots jsonb not null default '[]'::jsonb;
