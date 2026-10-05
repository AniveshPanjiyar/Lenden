-- Courses are one flat list; there is no main/skill distinction.
-- Payments that pointed at the "Skills" placeholder plus a skill course now
-- point directly at that course, and the empty "Skills" placeholders go away.
-- courses.kind and payments.skill_course_id are dropped in the next migration,
-- once the app no longer reads them.

update public.payments
set course_id = skill_course_id,
    skill_course_id = null
where skill_course_id is not null;

delete from public.courses course
where course.kind = 'main'
  and course.name = 'Skills'
  and not exists (select 1 from public.payments payment where payment.course_id = course.id or payment.skill_course_id = course.id)
  and not exists (select 1 from public.course_students student where student.source_course_id = course.id);

update public.courses set kind = 'main' where kind <> 'main';
alter table public.courses alter column kind set default 'main';

drop index if exists public.courses_business_name_kind_key;
create unique index courses_business_name_key on public.courses (business_id, name);
