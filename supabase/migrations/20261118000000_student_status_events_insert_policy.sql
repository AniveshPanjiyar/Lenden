-- Server actions write with the signed-in user's client, so the history table needs an insert
-- policy: staff who can change a student's status (same check as writing the student row) can log
-- the matching event, as themselves. History rows are never edited or deleted from the app.
drop policy if exists student_status_events_insert_unit_scope on public.student_status_events;
create policy student_status_events_insert_unit_scope on public.student_status_events
  for insert to authenticated
  with check (
    business_id = (select private.requested_business_id())
    and created_by = (select auth.uid())
    and not (select public.has_active_support_session(private.requested_business_id()))
    and (
      (student_type = 'library' and (select private.can_collect_business(private.requested_business_id(), 'library'::payment_business)))
      or (student_type = 'course' and (select private.can_collect_business(private.requested_business_id(), 'course'::payment_business)))
    )
  );
revoke update, delete, truncate on public.student_status_events from authenticated;
