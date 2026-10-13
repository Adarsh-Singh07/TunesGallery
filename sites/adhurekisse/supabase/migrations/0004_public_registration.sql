-- Public registration and confirmed-account activation. Apply after 0003.
--
-- Activation is deliberately stateful. Profiles created by this migration are
-- eligible while pending confirmation, whereas profiles that were already in
-- the database (or that an operator disabled) are locked. A Jam room code is
-- only for joining a room; it is never an account or library-access
-- credential.
--
-- Legacy operator procedure: existing inactive profiles remain
-- activation_eligible=false / activation_provenance='legacy_locked'. After
-- independently verifying the account, an operator may explicitly opt one in:
--   begin;
--   select pg_advisory_xact_lock(9182026,1);
--   update public.profiles
--      set activation_eligible=true,
--          activation_provenance='operator_verified'
--    where id='<verified-user-uuid>' and is_active=false;
--   commit;
-- The confirmed user can then activate. Operators may instead set is_active
-- directly. An explicit update of is_active=false (even on a pending profile)
-- locks the profile until the operator explicitly verifies it again. Operator
-- transactions changing account access must first take
-- pg_advisory_xact_lock(9182026,1), matching the access mutations in 0003.
begin;

-- Let in-flight signups finish under the old policy before changing profile
-- defaults, and keep new signups behind the new trigger until commit.
lock table auth.users in share row exclusive mode;

alter table public.profiles
  add column activation_eligible boolean not null default false;
alter table public.profiles
  add column activation_provenance text not null default 'legacy_locked';
alter table public.profiles
  add constraint profiles_activation_provenance_check check (
    activation_provenance in (
      'legacy_locked', 'public_registration', 'invitation',
      'operator_verified', 'operator_disabled'
    )
  );
alter table public.profiles
  add constraint profiles_activation_eligible_check check (
    not activation_eligible or (not is_active and
      activation_provenance in ('public_registration', 'operator_verified'))
  );

comment on column public.profiles.activation_eligible is
  'Explicit allow-list for confirmed-account activation; disabling clears it.';
comment on column public.profiles.activation_provenance is
  'Why activation is allowed or locked; legacy and operator-disabled rows fail closed.';

-- A service/operator disable must not leave a pending activation capability
-- behind. Authenticated clients only have update(display_name), but this also
-- protects trusted-server and dashboard updates. Re-enabling an old row is an
-- explicit operator decision, never an Auth side effect.
create or replace function public.guard_profile_activation_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.activation_eligible := false;
  if not new.is_active then
    new.activation_provenance := 'operator_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_activation_state_guard on public.profiles;
create trigger profiles_activation_state_guard
  before update of is_active on public.profiles
  for each row execute function public.guard_profile_activation_state();

-- Replace the 0003 trigger. New Auth rows are pending, non-admin profiles
-- regardless of raw metadata. The placeholder permits anonymous Auth rows to
-- exist without granting application access; a later verified email
-- is copied during activation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, email, display_name, is_admin, is_active,
    activation_eligible, activation_provenance
  )
  values (
    new.id,
    coalesce(nullif(trim(new.email), ''), 'anonymous+' || new.id::text || '@invalid.local'),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Listener'), 80),
    false,
    false,
    true,
    'public_registration'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Activate only a pending profile explicitly marked by this migration (or an
-- operator). Confirmation is checked against auth.users, not JWT metadata.
-- The exclusive application lock serializes activation with invitation and other
-- account-state mutations; the profile and selected invitation are row-locked
-- before either is changed.
create or replace function public.activate_account()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_profile public.profiles;
  v_inv public.invitations;
  v_has_invitation boolean := false;
begin
  if v_uid is null then return false; end if;

  perform pg_advisory_xact_lock(9182026, 1);

  -- Check trusted Auth state even for idempotent calls. An anonymous identity
  -- is not eligible even if it has an email. Lock it against concurrent Auth
  -- changes for the remainder of the activation transaction.
  select nullif(trim(u.email), '') into v_email
  from auth.users u
  where u.id = v_uid
    and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous, false)
    and (u.banned_until is null or u.banned_until <= now())
  for share;
  if v_email is null then return false; end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;
  if not found then return false; end if;

  -- Idempotent activation must preserve an already active administrator.
  if v_profile.is_active then return true; end if;

  if not v_profile.activation_eligible
     or v_profile.activation_provenance not in ('public_registration', 'operator_verified') then
    return false;
  end if;

  -- Invitations remain an optional, auditable path. A revoked, expired, or
  -- inviter-disabled invitation is ignored; public registration still works
  -- for an otherwise eligible new account.
  select i.* into v_inv
  from public.invitations i
  where lower(i.email::text) = lower(v_email)
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
    and private.admin(i.invited_by)
  order by i.created_at desc
  limit 1
  for update;
  v_has_invitation := found;

  if v_has_invitation then
    update public.profiles
    set email = v_email,
        is_active = true,
        is_admin = false,
        activation_eligible = false,
        invitation_id = v_inv.id,
        activation_provenance = 'invitation'
    where id = v_uid;
    update public.invitations
    set accepted_at = now(), accepted_user_id = v_uid
    where id = v_inv.id;
  else
    update public.profiles
    set email = v_email,
        is_active = true,
        is_admin = false,
        activation_eligible = false
    where id = v_uid;
  end if;

  return exists (
    select 1 from public.profiles where id = v_uid and is_active
  );
end;
$$;

-- Compatibility alias for clients deployed before public registration. It is
-- intentionally subject to exactly the same eligibility and lock checks.
create or replace function public.accept_invitation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.activate_account();
end;
$$;

revoke all on function public.activate_account() from public, anon, authenticated;
grant execute on function public.activate_account() to authenticated, service_role;
revoke all on function public.accept_invitation() from public, anon, authenticated;
grant execute on function public.accept_invitation() to authenticated, service_role;
revoke all on function public.handle_new_user(), public.guard_profile_activation_state()
  from public, anon, authenticated;

-- Preserve 0003's display-name-only client writes. Explicitly protect the new
-- columns even on projects with permissive Supabase default privileges.
revoke update(activation_eligible, activation_provenance) on public.profiles
  from public, anon, authenticated;

commit;
