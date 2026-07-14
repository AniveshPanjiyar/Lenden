-- Lenden provisions accounts directly with administrator/owner-managed
-- temporary passwords. Email invitation tokens are no longer part of the
-- authentication or membership flow.

drop function if exists public.accept_business_invitation(text);
drop table if exists public.business_invitations;
