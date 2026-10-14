-- 0005: Resend-sent email-code verification + authoritative registration limits.
--
-- Two problems this solves:
--   1. "A user can reach the app without verifying their email." Supabase
--      auto-confirms new accounts, so 0004's `email_confirmed_at is not null`
--      check passed immediately and activation was effectively a no-op. We add
--      an application-owned flag, `profiles.email_verified`, that is set ONLY by
--      the verify_email_code RPC after a Resend-sent code is entered. Self-
--      registration now requires it; trusted paths (invitation, operator
--      verification) are already vetted and are not gated.
--   2. "Registration is not rate-limited." The existing private.take_rate
--      limiter is keyed to an *authenticated active user*; sign-up happens
--      pre-auth through the anon key, so it was never enforced. Registration now
--      runs through a service-role endpoint guarded by a key-based limiter
--      (per-email, per-client-key, and global windows).
--
-- Apply after 0004. The migration is additive: existing active accounts are
-- backfilled to email_verified so nobody already working is locked out.
begin;

-- ── 1. Application-owned verification flag ──────────────────────────────────
alter table public.profiles
  add column email_verified boolean not null default false;

comment on column public.profiles.email_verified is
  'Set true only after the account verifies a Resend-sent code (or when a trusted path is used). Self-registration activation requires it.';

-- Backfill: anything already active or vetted is treated as verified. Pending
-- public_registration rows keep the default (false) and must complete the code
-- flow to become usable.
update public.profiles set email_verified = true
 where is_active = true
    or activation_provenance in ('invitation', 'operator_verified');

revoke update (email_verified) on public.profiles from public, anon, authenticated;

-- ── 2. Verification codes (one pending code per email) ───────────────────────
create table public.email_verification_codes (
  email        citext primary key,
  code_hash    text not null,
  nonce        text not null,
  attempts     integer not null default 0,
  expires_at   timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.email_verification_codes is
  'One-time email verification codes. The plaintext code is never stored; only sha256/code+nonce derived md5, so a leak of this table does not leak usable codes.';

revoke all on public.email_verification_codes from public, anon, authenticated;

-- ── 3. Pre-auth, key-based fixed-window limiter ─────────────────────────────
-- Mirrors private.take_rate but is keyed by an arbitrary string (email, client
-- ip, or 'global') because registration has no authenticated user yet.
create table private.register_rate (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null default 0
);
revoke all on private.register_rate from public, anon, authenticated;

create function private.take_register_rate(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_key is null or length(p_key) > 128 or p_limit is null or p_limit < 1
     or p_seconds is null or p_seconds < 1 then
    return false;
  end if;
  insert into private.register_rate as r (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set hits = case
          when r.window_start <= v_now - make_interval(secs => p_seconds)
            then 1 else least(r.hits + 1, p_limit + 1) end,
        window_start = case
          when r.window_start <= v_now - make_interval(secs => p_seconds)
            then v_now else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- ── 4. Mint + verify a code (both security definer, so they may touch the
--     codes table and private.register_rate without granting clients access).
create function public.request_email_code(
  p_email text,
  p_ttl_seconds integer default 900,
  p_rate_key text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email citext;
  v_code text;
  v_nonce text;
  v_ok boolean;
  v_ttl integer;
begin
  if p_email is null or length(p_email) > 254 or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return null;
  end if;
  v_email := p_email;
  v_ttl := coalesce(p_ttl_seconds, 900);
  if v_ttl < 60 or v_ttl > 3600 then v_ttl := 900; end if;

  -- Already verified: no further codes are ever needed for this address.
  if exists (select 1 from public.email_verification_codes c
             where c.email = v_email and c.verified_at is not null) then
    return null;
  end if;
  -- Per-address 60s cooldown against hammering "resend".
  if exists (select 1 from public.email_verification_codes c
             where c.email = v_email and c.last_sent_at > now() - interval '60 seconds') then
    return null;
  end if;

  -- Authoritative windows: per-email, per-client, global. Any window full → deny.
  v_ok := private.take_register_rate('email:' || lower(v_email), 5, 3600);
  if v_ok then v_ok := private.take_register_rate(coalesce(nullif(p_rate_key, ''), 'ip:unknown'), 30, 3600); end if;
  if v_ok then v_ok := private.take_register_rate('global', 200, 3600); end if;
  if not v_ok then return null; end if;

  v_code  := lpad(floor(mod(encode(extensions.gen_random_bytes(4), 'hex')::bigint, 1000000))::text, 6, '0');
  v_nonce := encode(extensions.gen_random_bytes(12), 'hex');

  if exists (select 1 from public.email_verification_codes c where c.email = v_email) then
    update public.email_verification_codes
       set code_hash = md5(v_code || ':' || v_nonce),
           nonce = v_nonce,
           attempts = 0,
           expires_at = now() + make_interval(secs => v_ttl),
           last_sent_at = now(),
           verified_at = null
     where email = v_email;
  else
    insert into public.email_verification_codes (email, code_hash, nonce, attempts, expires_at, last_sent_at, created_at)
    values (v_email, md5(v_code || ':' || v_nonce), v_nonce, 0, now() + make_interval(secs => v_ttl), now(), now());
  end if;

  return v_code;
end $$;

create function public.verify_email_code(p_email text, p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  c public.email_verification_codes;
begin
  if p_email is null or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or p_code is null or p_code !~ '^[0-9]{6}$' then
    return false;
  end if;

  -- Bound anonymous brute force per address independent of the per-code cap.
  if not private.take_register_rate('verify:' || lower(p_email), 20, 3600) then
    return false;
  end if;

  select * into c from public.email_verification_codes where email = lower(p_email) for update;
  if not found then return false; end if;
  if c.verified_at is not null then return true; end if;   -- idempotent success
  if c.expires_at <= now() then return false; end if;
  if c.attempts >= 10 then return false; end if;

  if c.code_hash is distinct from md5(p_code || ':' || c.nonce) then
    update public.email_verification_codes set attempts = c.attempts + 1 where email = c.email;
    return false;
  end if;

  update public.email_verification_codes set verified_at = now() where email = c.email;
  update public.profiles set email_verified = true
   where email = lower(p_email) and is_active = false;
  -- Mark the account confirmed in Auth so 0004's activate_account precondition
  -- (email_confirmed_at is not null) and Supabase sign-in both proceed. This is
  -- the same trusted write Supabase's own confirmation performs.
  update auth.users set email_confirmed_at = now()
   where lower(email::text) = lower(p_email) and email_confirmed_at is null;
  return true;
end $$;

-- ── 5. Gate self-registration activation on a verified email ────────────────
-- Faithful to 0004, plus: a public_registration account must have completed the
-- code flow (email_verified) before it can activate. Invitation and
-- operator_verified provenance are trusted and are not gated.
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

  if v_profile.is_active then return true; end if;

  if not v_profile.activation_eligible
     or v_profile.activation_provenance not in ('public_registration', 'operator_verified') then
    return false;
  end if;

  -- Self-registration is gated on the account having verified its Resend-sent
  -- code. The invitation and operator_verified branches are trusted and skip
  -- this check.
  if v_profile.activation_provenance = 'public_registration'
     and not coalesce(v_profile.email_verified, false) then
    return false;
  end if;

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
        is_admin = case
          when v_profile.activation_provenance = 'operator_verified'
            then v_profile.is_admin
          else false
        end,
        activation_eligible = false
    where id = v_uid;
  end if;

  return exists (
    select 1 from public.profiles where id = v_uid and is_active
  );
end $$;

-- ── 6. Grants ────────────────────────────────────────────────────────────────
revoke execute on function public.request_email_code(text, integer, text) from public, anon, authenticated;
grant execute on function public.request_email_code(text, integer, text) to service_role;

revoke execute on function public.verify_email_code(text, text) from public, anon, authenticated;
grant execute on function public.verify_email_code(text, text) to anon, authenticated, service_role;

commit;
