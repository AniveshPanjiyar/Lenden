-- Student read policies checked access once per row: the permission functions took the row's
-- business_id, so Postgres re-ran them (header parsing, membership and unit-scope lookups) for
-- every student, about 1 ms per row. Every readable row must belong to the requested business
-- anyway, so the checks now take that id and run once per query (as init plans); the row test is
-- a plain equality. The rules are unchanged.
alter policy students_select_unit_scope on public.library_students
using (
  business_id = (select private.requested_business_id())
  and (select private.can_read_business(private.requested_business_id()))
  and (
    (select public.has_active_support_session(private.requested_business_id()))
    or (select private.has_business_unit_access(private.requested_business_id(), 'library'::payment_business))
  )
);

alter policy course_students_select_unit_scope on public.course_students
using (
  business_id = (select private.requested_business_id())
  and (select private.can_read_business(private.requested_business_id()))
  and (
    (select public.has_active_support_session(private.requested_business_id()))
    or (select private.has_business_unit_access(private.requested_business_id(), 'course'::payment_business))
  )
);
