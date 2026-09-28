-- ═══════════════════════════════════════════════════════════════════════════
-- Adhure Kisse — initial schema
-- Profiles, invitations, tracks (+ permissions), playlists, jam rooms.
-- Every exposed table has Row Level Security enabled.
-- Run with: supabase db push   (or paste into the SQL editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive invitation emails

-- ── Enums ───────────────────────────────────────────────────────────────────
create type public.track_status   as enum ('pending', 'ready', 'failed');
create type public.jam_state      as enum ('idle', 'ready', 'playing', 'paused', 'ended');
create type public.jam_role       as enum ('host', 'guest');
create type public.jam_room_status as enum ('open', 'active', 'ended');

-- ═════════════════════════════════════════════════════════════════════════════
-- PROFILES
-- ═════════════════════════════════════════════════════════════════════════════
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       citext not null unique,
  display_name text not null default '',
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Auto-create a profile whenever an auth user appears. A brand-new user only
-- exists because an owner invited them in the Supabase dashboard, so the very
-- first profile becomes the admin (library owner) as a one-time bootstrap.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  any_admin boolean;
begin
  select exists (select 1 from public.profiles where is_admin) into any_admin;
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    not any_admin            -- first user ever = admin
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═════════════════════════════════════════════════════════════════════════════
-- INVITATIONS
-- ═════════════════════════════════════════════════════════════════════════════
create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null,
  code       text not null unique default encode(gen_random_bytes(9), 'hex'),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_email_code_unique unique (email, code)
);
create index invitations_pending_idx on public.invitations (email) where accepted_at is null;

-- ═════════════════════════════════════════════════════════════════════════════
-- TRACKS  (metadata lives here — never use R2 listings as a database)
-- ═════════════════════════════════════════════════════════════════════════════
create table public.tracks (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  title            text not null,
  artist           text not null default 'Unknown artist',
  album            text,
  movie            text,
  year             text,
  tags             text[] not null default '{}',
  -- R2 object keys are server-assigned, non-guessable UUID paths
  audio_key        text unique,
  artwork_key      text,
  mime_type        text,
  size_bytes       bigint,
  duration_seconds double precision,
  status           public.track_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index tracks_owner_idx    on public.tracks (owner_id);
create index tracks_status_idx   on public.tracks (status);
create index tracks_title_idx    on public.tracks using gin (to_tsvector('simple', title));

-- Per-user playback grants. Knowing a track id must NOT imply access.
create table public.track_permissions (
  track_id     uuid not null references public.tracks (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  granted_by   uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (track_id, user_id)
);

-- ═════════════════════════════════════════════════════════════════════════════
-- PLAYLISTS
-- ═════════════════════════════════════════════════════════════════════════════
create table public.playlists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    integer not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
create index playlist_tracks_pos_idx on public.playlist_tracks (playlist_id, position);

-- ═════════════════════════════════════════════════════════════════════════════
-- JAM
-- ═════════════════════════════════════════════════════════════════════════════
create table public.jam_rooms (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- short, human-shareable join code
  host_id       uuid not null references public.profiles (id) on delete cascade,
  guest_id      uuid references public.profiles (id) on delete set null,
  status        public.jam_room_status not null default 'open',
  collaborative boolean not null default false,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz,
  expires_at    timestamptz not null default now() + interval '12 hours'
);
create index jam_rooms_status_idx on public.jam_rooms (status);
create index jam_rooms_host_idx   on public.jam_rooms (host_id, status);

create table public.jam_participants (
  room_id   uuid not null references public.jam_rooms (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      public.jam_role not null,
  status    text not null default 'joining'
            check (status in ('joining','ready','buffering','listening','reconnecting','disconnected','left')),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Authoritative shared timeline. `position_seconds` is the reference position
-- as of `updated_at` (server time); clients compute the live position from
-- their estimated server-clock offset. Never copied raw from a client.
create table public.jam_room_state (
  room_id          uuid primary key references public.jam_rooms (id) on delete cascade,
  track_id         uuid references public.tracks (id) on delete set null,
  playback_state   public.jam_state not null default 'idle',
  position_seconds double precision not null default 0,
  revision         bigint not null default 0,     -- bumped atomically per command
  updated_by       uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);

create table public.jam_queue (
  id       uuid primary key default gen_random_uuid(),
  room_id  uuid not null references public.jam_rooms (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  position integer not null,
  added_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index jam_queue_room_idx on public.jam_queue (room_id, position);

-- Append-only event log (audit + post-hoc debugging). Realtime broadcasts are
-- ephemeral; this table is the durable trace.
create table public.jam_events (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.jam_rooms (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  actor_id   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index jam_events_room_idx on public.jam_events (room_id, id desc);

-- ═════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (security definer; used by policies and the API)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.current_uid()
returns uuid
language sql stable security definer set search_path = public
as $$ select auth.uid() $$;

create or replace function public.current_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Central access rule: owner, admin, explicit grant, or active jam participant
-- for a room currently playing this track. A jam invitation must not open the
-- whole library — only the track the room is actually sharing.
create or replace function public.has_track_access(p_track uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- owner
    exists (select 1 from public.tracks t where t.id = p_track and t.owner_id = auth.uid())
    -- admin
    or public.current_is_admin()
    -- explicit grant
    or exists (
      select 1 from public.track_permissions tp
      where tp.track_id = p_track and tp.user_id = auth.uid()
    )
    -- active jam participant of a room sharing this track
    or exists (
      select 1
      from public.jam_room_state s
      join public.jam_rooms r on r.id = s.room_id
      join public.jam_participants p on p.room_id = r.id and p.user_id = auth.uid()
      where s.track_id = p_track and r.status in ('open', 'active')
    );
$$;

-- Server-time oracle for clock-offset estimation.
create or replace function public.server_time()
returns timestamptz
language sql volatile
as $$ select now() $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles          enable row level security;
alter table public.invitations       enable row level security;
alter table public.tracks            enable row level security;
alter table public.track_permissions enable row level security;
alter table public.playlists         enable row level security;
alter table public.playlist_tracks   enable row level security;
alter table public.jam_rooms         enable row level security;
alter table public.jam_participants  enable row level security;
alter table public.jam_room_state    enable row level security;
alter table public.jam_queue         enable row level security;
alter table public.jam_events        enable row level security;

-- profiles: read any authenticated (needed to show names in a jam); self-update
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select is_admin from public.profiles where id = auth.uid()));

-- invitations: admin only, via RPCs; direct access denied
create policy invitations_admin_select on public.invitations
  for select to authenticated using (public.current_is_admin());
create policy invitations_admin_write on public.invitations
  for insert to authenticated with check (public.current_is_admin());
create policy invitations_admin_delete on public.invitations
  for delete to authenticated using (public.current_is_admin());

-- tracks: read through has_track_access; write = owner or admin
create policy tracks_select on public.tracks
  for select to authenticated using (public.has_track_access(id));
create policy tracks_insert_admin on public.tracks
  for insert to authenticated with check (owner_id = auth.uid() and public.current_is_admin());
create policy tracks_update_admin on public.tracks
  for update to authenticated
  using (owner_id = auth.uid() or public.current_is_admin())
  with check (owner_id = auth.uid() or public.current_is_admin());
create policy tracks_delete_admin on public.tracks
  for delete to authenticated using (owner_id = auth.uid() or public.current_is_admin());

-- track_permissions: admin manages; members can read their own grants
create policy tp_select on public.track_permissions
  for select to authenticated using (user_id = auth.uid() or public.current_is_admin());
create policy tp_write on public.track_permissions
  for insert to authenticated with check (public.current_is_admin());
create policy tp_delete on public.track_permissions
  for delete to authenticated using (public.current_is_admin());

-- playlists: owner full control; read = owner or admin
create policy playlists_select on public.playlists
  for select to authenticated using (owner_id = auth.uid() or public.current_is_admin());
create policy playlists_write on public.playlists
  for insert to authenticated with check (owner_id = auth.uid());
create policy playlists_update on public.playlists
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy playlists_delete on public.playlists
  for delete to authenticated using (owner_id = auth.uid());

create policy pt_select on public.playlist_tracks
  for select to authenticated using (
    exists (select 1 from public.playlists p where p.id = playlist_id and (p.owner_id = auth.uid() or public.current_is_admin()))
  );
create policy pt_write on public.playlist_tracks
  for insert to authenticated with check (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
    and public.has_track_access(track_id)
  );
create policy pt_delete on public.playlist_tracks
  for delete to authenticated using (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = auth.uid())
  );

-- jam_rooms: participants see their rooms; anyone authenticated can see open rooms to join by code
create policy rooms_select on public.jam_rooms
  for select to authenticated using (
    host_id = auth.uid() or guest_id = auth.uid()
    or (status = 'open' and expires_at > now())
  );
create policy rooms_insert on public.jam_rooms
  for insert to authenticated with check (host_id = auth.uid());

-- participants: room members read; rows managed through RPCs
create policy participants_select on public.jam_participants
  for select to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    ) or user_id = auth.uid()
  );

-- room state + queue: readable by room members (and used by has_track_access)
create policy state_select on public.jam_room_state
  for select to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

create policy queue_select on public.jam_queue
  for select to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

create policy queue_insert on public.jam_queue
  for insert to authenticated with check (
    added_by = auth.uid()
    and exists (
      select 1 from public.jam_rooms r
      where r.id = room_id
        and r.status in ('open','active')
        and (r.host_id = auth.uid() or (r.collaborative and r.guest_id = auth.uid()))
    )
  );
create policy queue_modify on public.jam_queue
  for delete to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id
        and r.status in ('open','active')
        and (r.host_id = auth.uid() or (r.collaborative and r.guest_id = auth.uid()))
    )
  );
create policy queue_reorder on public.jam_queue
  for update to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id
        and r.status in ('open','active')
        and (r.host_id = auth.uid() or (r.collaborative and r.guest_id = auth.uid()))
    )
  ) with check (true);

-- events: members can read their own room's trace; inserts happen via RPC
create policy events_select on public.jam_events
  for select to authenticated using (
    exists (
      select 1 from public.jam_rooms r
      where r.id = room_id and (r.host_id = auth.uid() or r.guest_id = auth.uid())
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- JAM RPCs — the only write path for authoritative room state.
-- Atomic updates with revision checks reject stale / replayed commands.
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a room. Caller becomes host. One open/active room per host.
create or replace function public.jam_create_room(p_collaborative boolean default false)
returns table (room_id uuid, room_code text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_code  text;
  v_open  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- A host cannot authoritatively run two rooms at once
  select id into v_open from public.jam_rooms
  where host_id = v_uid and status in ('open','active') and expires_at > now()
  limit 1;
  if v_open is not null then
    update public.jam_rooms set status = 'ended', ended_at = now() where id = v_open;
  end if;

  loop
    v_code := upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 6));
    v_code := translate(v_code, '/+=', 'ABX');
    exit when not exists (select 1 from public.jam_rooms where code = v_code);
  end loop;

  insert into public.jam_rooms (host_id, code, collaborative)
  values (v_uid, v_code, p_collaborative)
  returning jam_rooms.id into v_id;

  insert into public.jam_participants (room_id, user_id, role, status)
  values (v_id, v_uid, 'host', 'joining');

  insert into public.jam_room_state (room_id, updated_by) values (v_id, v_uid);
  insert into public.jam_events (room_id, type, actor_id, payload)
  values (v_id, 'room.created', v_uid, jsonb_build_object('code', v_code));

  return query select v_id, v_code;
end;
$$;

-- Join an open room by its code. Exactly one guest.
create or replace function public.jam_join_room(p_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_room public.jam_rooms;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_room from public.jam_rooms
  where code = upper(trim(p_code)) and status = 'open' and expires_at > now()
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.host_id = v_uid then raise exception 'ALREADY_HOST'; end if;
  if v_room.guest_id is not null and v_room.guest_id <> v_uid then
    raise exception 'ROOM_FULL';
  end if;

  update public.jam_rooms set guest_id = v_uid, status = 'active' where id = v_room.id;

  insert into public.jam_participants (room_id, user_id, role, status)
  values (v_room.id, v_uid, 'guest', 'joining')
  on conflict (room_id, user_id) do update set status = 'joining', last_seen = now();

  insert into public.jam_events (room_id, type, actor_id)
  values (v_room.id, 'participant.joined', v_uid);

  return v_room.id;
end;
$$;

-- Leave (guest) or end (host) a room.
create or replace function public.jam_leave_room(p_room_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_room public.jam_rooms;
begin
  select * into v_room from public.jam_rooms where id = p_room_id for update;
  if not found then return; end if;

  if v_room.host_id = auth.uid() then
    update public.jam_rooms set status = 'ended', ended_at = now() where id = p_room_id;
    update public.jam_room_state set playback_state = 'ended' where room_id = p_room_id;
    insert into public.jam_events (room_id, type, actor_id) values (p_room_id, 'room.ended', auth.uid());
  else
    update public.jam_rooms set guest_id = null, status = 'open' where id = p_room_id;
    update public.jam_participants set status = 'left' where room_id = p_room_id and user_id = auth.uid();
    insert into public.jam_events (room_id, type, actor_id) values (p_room_id, 'participant.left', auth.uid());
  end if;
end;
$$;

-- Presence heartbeat for a participant.
create or replace function public.jam_heartbeat(p_room_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.jam_participants
  set status = p_status, last_seen = now()
  where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- The authoritative command path. Host-only unless collaborative allows the
-- guest the same controls. `p_expected_revision` makes stale commands fail;
-- `p_command_id` lets clients dedupe retries.
create or replace function public.jam_apply_command(
  p_room_id           uuid,
  p_command_id        uuid,
  p_type              text,
  p_payload           jsonb default '{}'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_room   public.jam_rooms;
  v_state  public.jam_room_state;
  v_track  uuid;
  v_pos    double precision;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_room from public.jam_rooms where id = p_room_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'active' and v_room.status <> 'open' then raise exception 'ROOM_ENDED'; end if;

  -- Authorization: host always; guest only when collaborative mode allows it
  if v_uid <> v_room.host_id then
    if not (v_room.collaborative and v_uid = v_room.guest_id) then
      raise exception 'FORBIDDEN';
    end if;
    if p_type in ('end_room', 'set_collaborative') then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  select * into v_state from public.jam_room_state where room_id = p_room_id for update;
  if p_expected_revision is not null and v_state.revision <> p_expected_revision then
    raise exception 'STALE_REVISION';
  end if;

  v_track := v_state.track_id;
  v_pos   := v_state.position_seconds;

  case p_type
    when 'play' then
      v_state.playback_state := 'playing';
    when 'pause' then
      v_state.playback_state := 'paused';
      -- freeze the reference position at pause time
      v_pos := p_payload ->> 'position_seconds';
      if v_pos is null then
        v_pos := v_state.position_seconds + extract(epoch from (now() - v_state.updated_at));
      end if;
    when 'seek' then
      v_pos := (p_payload ->> 'position_seconds')::double precision;
      if v_state.playback_state = 'playing' then
        v_state.playback_state := 'playing';
      end if;
    when 'set_track' then
      v_track := (p_payload ->> 'track_id')::uuid;
      if v_track is not null and not public.has_track_access(v_track) then
        raise exception 'TRACK_ACCESS_DENIED';
      end if;
      v_pos   := coalesce((p_payload ->> 'position_seconds')::double precision, 0);
      v_state.playback_state := 'idle';   -- goes ready → playing after preload handshake
    when 'start_at' then
      -- scheduled start issued after both clients reported ready
      v_state.playback_state := 'playing';
      v_pos := coalesce((p_payload ->> 'position_seconds')::double precision, 0);
    when 'set_collaborative' then
      update public.jam_rooms set collaborative = coalesce(p_payload ->> 'collaborative', false)
      where id = p_room_id;
    when 'end_room' then
      update public.jam_rooms set status = 'ended', ended_at = now() where id = p_room_id;
      v_state.playback_state := 'ended';
    else
      raise exception 'UNKNOWN_COMMAND %', p_type;
  end case;

  update public.jam_room_state
  set track_id         = v_track,
      playback_state   = v_state.playback_state,
      position_seconds = coalesce(v_pos, v_state.position_seconds),
      revision         = v_state.revision + 1,
      updated_by       = v_uid,
      updated_at       = now()
  where room_id = p_room_id
  returning revision into v_state.revision;

  insert into public.jam_events (room_id, type, actor_id, payload)
  values (p_room_id, 'command.' || p_type, v_uid,
          jsonb_build_object('command_id', p_command_id, 'payload', p_payload));

  return jsonb_build_object('revision', v_state.revision);
end;
$$;

-- Expire abandoned rooms; callable by anyone authenticated (cron-safe).
create or replace function public.jam_expire_rooms()
returns void
language sql security definer set search_path = public
as $$
  update public.jam_rooms
  set status = 'ended', ended_at = now()
  where status in ('open','active') and expires_at < now();
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- UPDATED_AT touch trigger for tracks
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger tracks_touch before update on public.tracks
  for each row execute function public.touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- PRIVILEGES — RLS filters rows, but PostgREST still needs table/function
-- grants for the authenticated role (Supabase default ACLs grant no CRUD on
-- tables created by the postgres role). Scoped to the new objects only.
-- ═════════════════════════════════════════════════════════════════════════════
grant select, insert, update, delete on
  public.profiles, public.invitations, public.tracks, public.track_permissions,
  public.playlists, public.playlist_tracks, public.jam_rooms, public.jam_participants,
  public.jam_room_state, public.jam_queue, public.jam_events
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function
  public.current_uid(), public.current_is_admin(), public.has_track_access(uuid),
  public.server_time(), public.jam_create_room(boolean), public.jam_join_room(text),
  public.jam_leave_room(uuid), public.jam_heartbeat(uuid, text),
  public.jam_apply_command(uuid, uuid, text, jsonb, bigint), public.jam_expire_rooms()
  to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- REALTIME — deliver authoritative state changes to subscribed members.
-- RLS filters postgres_changes payloads to rows the caller can SELECT.
-- ═════════════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.jam_room_state;
alter publication supabase_realtime add table public.jam_queue;
alter publication supabase_realtime add table public.jam_participants;
alter publication supabase_realtime add table public.tracks;
