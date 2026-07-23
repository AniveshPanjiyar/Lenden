create or replace function public.create_business_with_owner(
  final_name text,
  final_slug text,
  final_timezone text,
  final_currency text,
  final_modules public.payment_business[],
  target_owner_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  owner_profile public.profiles%rowtype;
  new_business_id uuid;
  normalized_owner_email text := lower(btrim(target_owner_email));
begin
  if not exists (
    select 1
    from public.profiles
    where id = actor_id
      and active = true
      and account_status = 'active'
      and platform_role = 'platform_admin'
  ) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  if char_length(btrim(final_name)) < 2 then
    raise exception 'Business name is required.' using errcode = '22023';
  end if;
  if final_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Business URL is invalid.' using errcode = '22023';
  end if;
  if nullif(btrim(final_timezone), '') is null then
    raise exception 'Timezone is required.' using errcode = '22023';
  end if;
  if final_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency is invalid.' using errcode = '22023';
  end if;
  if coalesce(cardinality(final_modules), 0) = 0 then
    raise exception 'Enable at least one module.' using errcode = '22023';
  end if;

  select *
  into owner_profile
  from public.profiles
  where lower(email) = normalized_owner_email
  for update;

  if owner_profile.id is null then
    raise exception 'No registered Lenden account was found for this Owner email.' using errcode = '22023';
  end if;
  if not owner_profile.active or owner_profile.account_status <> 'active' then
    raise exception 'The Owner account is inactive.' using errcode = '22023';
  end if;

  if exists (select 1 from public.businesses where slug = final_slug) then
    raise exception 'That business URL is already in use.' using errcode = '23505';
  end if;

  insert into public.businesses (name, slug, status, timezone, currency, created_by)
  values (
    btrim(final_name),
    final_slug,
    'active',
    btrim(final_timezone),
    final_currency,
    actor_id
  )
  returning id into new_business_id;

  insert into public.business_modules (business_id, module, enabled, configured_by)
  select new_business_id, module, true, actor_id
  from (
    select distinct unnest(final_modules) as module
  ) selected_modules;

  insert into public.business_memberships (
    business_id,
    profile_id,
    role,
    status,
    invited_by,
    invited_at,
    joined_at
  )
  values (
    new_business_id,
    owner_profile.id,
    'primary_owner',
    'active',
    actor_id,
    now(),
    now()
  );

  update public.profiles
  set last_business_id = new_business_id
  where id = owner_profile.id
    and last_business_id is null;

  insert into public.audit_events (
    business_id,
    actor_profile_id,
    event_type,
    entity_type,
    entity_id,
    after_data
  )
  values (
    new_business_id,
    actor_id,
    'business_created',
    'business',
    new_business_id,
    jsonb_build_object(
      'name', btrim(final_name),
      'slug', final_slug,
      'modules', final_modules,
      'initial_owner_profile_id', owner_profile.id,
      'owner_account', 'existing'
    )
  );

  return new_business_id;
end;
$$;

revoke all on function public.create_business_with_owner(
  text,
  text,
  text,
  text,
  public.payment_business[],
  text
) from public;

grant execute on function public.create_business_with_owner(
  text,
  text,
  text,
  text,
  public.payment_business[],
  text
) to authenticated;
