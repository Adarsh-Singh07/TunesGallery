-- Forward-only hardening. Apply after 0001 and 0002.
-- Deliberately fail closed for legacy profiles: an operator must verify and
-- activate the owner by UUID; an old first-user admin flag is not proof of trust.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter table public.profiles add column is_active boolean not null default false;
alter table public.invitations add column accepted_user_id uuid references public.profiles(id);
alter table public.invitations add column revoked_at timestamptz;
alter table public.profiles add column invitation_id uuid references public.invitations(id) on delete set null;
alter table public.tracks add column checksum_md5 text;
create unique index tracks_content_unique on public.tracks(checksum_md5, size_bytes)
  where status = 'ready' and checksum_md5 is not null;

create table public.playlist_permissions (
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  grant_tracks boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (playlist_id,user_id)
);
create table public.track_revocations (
  track_id uuid not null references public.tracks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(track_id,user_id)
);
create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('audio','artwork')),
  object_key text not null unique,
  mime_type text not null,
  expected_bytes bigint check(expected_bytes > 0),
  expected_md5 text check(expected_md5 ~ '^[a-f0-9]{32}$'),
  previous_key text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);
create index upload_intents_track on public.upload_intents(track_id,kind,created_at desc);
create table private.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key(user_id,bucket)
);
create table private.storage_gc (
  object_key text primary key,
  not_before timestamptz not null default now() + interval '20 minutes',
  created_at timestamptz not null default now()
);

create function private.active(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=p_user and is_active)
$$;
create function public.current_is_active() returns boolean
language sql stable security definer set search_path = '' as $$ select private.active(auth.uid()) $$;
create or replace function public.current_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and is_admin and is_active)
$$;
create function private.admin(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=p_user and is_admin and is_active)
$$;

-- No metadata flags, first-user inference, or Auth-account existence grant access.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,display_name,is_admin,is_active)
  values(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'display_name','Listener'),80),false,false)
  on conflict(id) do nothing;
  return new;
end $$;

create function public.accept_invitation() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_inv public.invitations;
begin
  perform pg_advisory_xact_lock(9182026,1);
  if auth.uid() is null then return false; end if;
  if private.active(auth.uid()) then return true; end if;
  select email into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  select * into v_inv from public.invitations
    where lower(email::text)=lower(v_email) and accepted_at is null
      and revoked_at is null and expires_at>now()
      and private.admin(invited_by)
    order by created_at desc limit 1 for update;
  if not found then return false; end if;
  -- An old first-user admin bit is never inherited through an invitation.
  update public.profiles set is_active=true,is_admin=false,invitation_id=v_inv.id where id=auth.uid();
  update public.invitations set accepted_at=now(),accepted_user_id=auth.uid() where id=v_inv.id;
  return true;
end $$;

-- Atomic fixed-window limiter. The conflict update locks the shared row: no
-- read/increment race across lambdas. Caller-supplied limits are never exposed.
create function private.take_rate(p_user uuid,p_bucket text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer; v_now timestamptz := clock_timestamp();
begin
  if not private.active(p_user) then return false; end if;
  insert into private.rate_limits as r(user_id,bucket,window_start,hits)
  values(p_user,p_bucket,v_now,1)
  on conflict(user_id,bucket) do update set
    hits=case when r.window_start <= v_now-make_interval(secs=>p_seconds) then 1 else least(r.hits+1,p_limit+1) end,
    window_start=case when r.window_start <= v_now-make_interval(secs=>p_seconds) then v_now else r.window_start end
  returning hits into v_hits;
  return v_hits<=p_limit;
end $$;
create function public.consume_rate_limit(p_bucket text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_limit integer;
begin
  if not public.current_is_active() then raise exception 'FORBIDDEN'; end if;
  v_limit := case p_bucket when 'read' then 180 when 'write' then 60
    when 'upload' then 30 when 'stream' then 120 when 'invitation' then 10
    when 'chat' then 30 else 0 end;
  if v_limit=0 then raise exception 'INVALID_INPUT'; end if;
  return private.take_rate(auth.uid(),'api:'||p_bucket,v_limit,60);
end $$;

create function private.track_access(p_user uuid,p_track uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.active(p_user) and exists (
    select 1 from public.tracks t where t.id=p_track and (
      private.admin(p_user) or (
        not exists(select 1 from public.track_revocations x where x.user_id=p_user and x.track_id=t.id)
        and (t.owner_id=p_user or exists(select 1 from public.track_permissions g where g.track_id=t.id and g.user_id=p_user)
          or exists(select 1 from public.playlist_tracks pt
            join public.playlist_permissions g on g.playlist_id=pt.playlist_id
            join public.playlists pl on pl.id=pt.playlist_id
            where pt.track_id=t.id and g.user_id=p_user and g.grant_tracks and private.admin(pl.owner_id)))
      )
    )
  )
$$;
create or replace function public.has_track_access(p_track uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select private.track_access(auth.uid(),p_track) $$;
create function public.has_playlist_access(p_playlist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_is_active() and exists(select 1 from public.playlists p where p.id=p_playlist
    and (p.owner_id=auth.uid() or public.current_is_admin() or exists(
      select 1 from public.playlist_permissions g where g.playlist_id=p.id and g.user_id=auth.uid())))
$$;

alter table public.jam_room_state add column track_revision bigint not null default 0;
alter table public.jam_room_state add column scheduled_start_at timestamptz;
alter table public.jam_participants add column ready_track_id uuid references public.tracks(id) on delete set null;
alter table public.jam_participants add column ready_revision bigint;
create table private.jam_commands (
  room_id uuid not null references public.jam_rooms(id) on delete cascade,
  command_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  type text not null,
  payload jsonb not null,
  result jsonb not null,
  primary key(room_id,command_id)
);
create table public.jam_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.jam_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  name text not null,
  text text not null check(char_length(text) between 1 and 280),
  kind text not null default 'chat' check(kind in ('chat','reaction')),
  created_at timestamptz not null default now()
);
create index jam_messages_room on public.jam_messages(room_id,created_at);
create function public.jam_is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_is_active() and exists (
    select 1 from public.jam_rooms r join public.jam_participants p on p.room_id=r.id
    where r.id=p_room and p.user_id=auth.uid() and p.status<>'left'
      and (r.host_id=auth.uid() or r.guest_id=auth.uid())
      and r.expires_at>now()
  )
$$;
create function private.room_track_allowed(p_room uuid,p_track uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.jam_rooms r join public.tracks t on t.id=p_track
    where r.id=p_room and t.status='ready' and private.track_access(r.host_id,p_track)
      and (r.guest_id is null or private.track_access(r.guest_id,p_track)))
$$;

-- Reset old permissive policies and grants only on this application's tables.
do $$ declare r record; t text;
begin
  foreach t in array array['profiles','invitations','tracks','track_permissions','track_revocations',
    'playlists','playlist_tracks','playlist_permissions','upload_intents','jam_rooms','jam_participants',
    'jam_room_state','jam_queue','jam_events','jam_messages','messages'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',r.policyname,t);
    end loop;
  end loop;
end $$;
grant select on public.profiles,public.invitations,public.tracks,public.track_permissions,
  public.playlists,public.playlist_tracks,public.playlist_permissions,public.jam_rooms,
  public.jam_participants,public.jam_room_state,public.jam_queue,public.jam_events,public.jam_messages,public.messages to authenticated;
grant update(display_name) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (
  public.current_is_active() and (id=auth.uid() or public.current_is_admin() or exists(
    select 1 from public.jam_participants p where p.user_id=profiles.id and public.jam_is_member(p.room_id)))
);
create policy profiles_name on public.profiles for update to authenticated
  using(id=auth.uid() and public.current_is_active()) with check(id=auth.uid() and char_length(display_name)<=80);
create policy invitations_read on public.invitations for select to authenticated using(public.current_is_admin());
create policy tracks_read on public.tracks for select to authenticated using(public.has_track_access(id));
create policy grants_read on public.track_permissions for select to authenticated
  using(public.current_is_active() and (user_id=auth.uid() or public.current_is_admin()));
create policy playlists_read on public.playlists for select to authenticated using(public.has_playlist_access(id));
create policy playlist_tracks_read on public.playlist_tracks for select to authenticated
  using(public.has_playlist_access(playlist_id) and public.has_track_access(track_id));
create policy playlist_grants_read on public.playlist_permissions for select to authenticated using(public.has_playlist_access(playlist_id));
create policy rooms_read on public.jam_rooms for select to authenticated using(public.jam_is_member(id));
create policy participants_read on public.jam_participants for select to authenticated using(public.jam_is_member(room_id));
create policy state_read on public.jam_room_state for select to authenticated using(public.jam_is_member(room_id));
create policy queue_read on public.jam_queue for select to authenticated using(public.jam_is_member(room_id));
create policy events_read on public.jam_events for select to authenticated using(public.jam_is_member(room_id));
create policy jam_messages_read on public.jam_messages for select to authenticated using(public.jam_is_member(room_id));
alter table public.messages add column user_id uuid references public.profiles(id);
create policy messages_read on public.messages for select to authenticated using(public.current_is_active());

-- Realtime authorizes channel membership, not payload identity. No client
-- publication on Jam topics: chat, readiness, reactions and presence use RPCs.
create function public.jam_topic_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.jam_rooms r where 'jam:'||r.id::text=realtime.topic()
    and r.status in ('open','active') and public.jam_is_member(r.id))
$$;
create policy jam_receive on realtime.messages for select to authenticated
  using(extension in ('broadcast','presence') and public.jam_topic_member());
create policy jam_receive_guard on realtime.messages as restrictive for select to authenticated
  using(realtime.topic() not like 'jam:%' or public.jam_topic_member());
create policy jam_publish_guard on realtime.messages as restrictive for insert to authenticated
  with check(realtime.topic() not like 'jam:%');
create policy jam_anon_read_guard on realtime.messages as restrictive for select to anon
  using(realtime.topic() not like 'jam:%');
create policy jam_anon_write_guard on realtime.messages as restrictive for insert to anon
  with check(realtime.topic() not like 'jam:%');

create or replace function public.jam_create_room(p_collaborative boolean default false)
returns table(room_id uuid,room_code text) language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_bytes bytea;
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  if not public.current_is_active() then raise exception 'FORBIDDEN'; end if;
  if not private.take_rate(auth.uid(),'jam:create',10,60) then raise exception 'RATE_LIMITED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  update public.jam_room_state s set playback_state='ended',revision=revision+1,updated_at=now(),scheduled_start_at=null
    from public.jam_rooms r where s.room_id=r.id and r.host_id=auth.uid() and r.status<>'ended';
  update public.jam_rooms set status='ended',ended_at=now() where host_id=auth.uid() and status<>'ended';
  loop
    v_bytes:=extensions.gen_random_bytes(6); v_code:='';
    for i in 0..5 loop
      v_code:=v_code||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(v_bytes,i)%32+1,1);
    end loop;
    begin
      insert into public.jam_rooms(host_id,code,collaborative) values(auth.uid(),v_code,coalesce(p_collaborative,false)) returning id into v_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.jam_participants(room_id,user_id,role) values(v_id,auth.uid(),'host');
  insert into public.jam_room_state(room_id,updated_by) values(v_id,auth.uid());
  insert into public.jam_events(room_id,type,actor_id) values(v_id,'room.created',auth.uid());
  return query select v_id,v_code;
end $$;

create or replace function public.jam_join_room(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.jam_rooms; v_track uuid;
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  if not public.current_is_active() then raise exception 'FORBIDDEN'; end if;
  -- Return NULL on unsuccessful joins, not an exception: this commits the
  -- limiter increment even for invalid-code guesses (exceptions roll it back).
  if not private.take_rate(auth.uid(),'jam:join',20,60) then return null; end if;
  if p_code is null or length(trim(p_code)) not between 6 and 8 then return null; end if;
  select * into r from public.jam_rooms where code=upper(trim(p_code)) and status<>'ended' and expires_at>now() for update;
  if not found or not private.active(r.host_id) then return null; end if;
  if r.host_id=auth.uid() then return r.id; end if;
  if r.guest_id=auth.uid() then return r.id; end if;
  if r.guest_id is not null then return null; end if;
  select track_id into v_track from public.jam_room_state where room_id=r.id;
  if v_track is not null and not private.track_access(auth.uid(),v_track) then return null; end if;
  if exists(select 1 from public.jam_queue where room_id=r.id and not private.track_access(auth.uid(),track_id)) then return null; end if;
  update public.jam_rooms set guest_id=auth.uid(),status='active' where id=r.id;
  insert into public.jam_participants(room_id,user_id,role,status) values(r.id,auth.uid(),'guest','joining')
    on conflict(room_id,user_id) do update set status='joining',last_seen=now(),ready_track_id=null,ready_revision=null;
  -- Joining pauses the timeline until both listeners load the current track.
  update public.jam_room_state set
    position_seconds=position_seconds+case when playback_state='playing' then greatest(0,extract(epoch from now()-updated_at)) else 0 end,
    playback_state=case when track_id is null then 'idle'::public.jam_state else 'paused'::public.jam_state end,
    revision=revision+1,updated_at=now(),scheduled_start_at=null where room_id=r.id;
  insert into public.jam_events(room_id,type,actor_id) values(r.id,'participant.joined',auth.uid());
  return r.id;
end $$;

create or replace function public.jam_leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.jam_rooms;
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  select * into r from public.jam_rooms where id=p_room_id for update;
  if not found or not public.jam_is_member(p_room_id) then raise exception 'FORBIDDEN'; end if;
  if r.status='ended' then return; end if;
  if r.host_id=auth.uid() then
    update public.jam_rooms set status='ended',ended_at=now() where id=p_room_id;
    update public.jam_room_state set playback_state='ended',revision=revision+1,updated_at=now(),scheduled_start_at=null where room_id=p_room_id;
  elsif r.guest_id=auth.uid() then
    update public.jam_rooms set guest_id=null,status='open' where id=p_room_id;
    update public.jam_participants set status='left',ready_track_id=null,ready_revision=null where room_id=p_room_id and user_id=auth.uid();
    update public.jam_room_state set
      position_seconds=position_seconds+case when playback_state='playing' then greatest(0,extract(epoch from now()-updated_at)) else 0 end,
      playback_state='paused',revision=revision+1,updated_at=now(),scheduled_start_at=null where room_id=p_room_id;
  else raise exception 'FORBIDDEN'; end if;
  insert into public.jam_events(room_id,type,actor_id) values(p_room_id,case when r.host_id=auth.uid() then 'room.ended' else 'participant.left' end,auth.uid());
end $$;

create or replace function public.jam_heartbeat(p_room_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  perform 1 from public.jam_rooms where id=p_room_id and status<>'ended' for update;
  if not found or not public.jam_is_member(p_room_id) then raise exception 'FORBIDDEN'; end if;
  if p_status is null or p_status not in ('joining','ready','buffering','listening','reconnecting','disconnected') then raise exception 'INVALID_INPUT'; end if;
  if not private.take_rate(auth.uid(),'jam:heartbeat',120,60) then raise exception 'RATE_LIMITED'; end if;
  update public.jam_participants set status=p_status,last_seen=now(),
    ready_track_id=case when p_status in ('buffering','reconnecting','disconnected','joining') then null else ready_track_id end,
    ready_revision=case when p_status in ('buffering','reconnecting','disconnected','joining') then null else ready_revision end
    where room_id=p_room_id and user_id=auth.uid();
end $$;
create function public.jam_set_ready(p_room_id uuid,p_track_id uuid,p_expected_revision bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.jam_room_state;
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  perform 1 from public.jam_rooms where id=p_room_id and status<>'ended' for update;
  if not found or not public.jam_is_member(p_room_id) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.jam_room_state where room_id=p_room_id;
  if p_track_id is null or s.track_id is distinct from p_track_id or s.revision is distinct from p_expected_revision then raise exception 'STALE_REVISION'; end if;
  if not private.room_track_allowed(p_room_id,p_track_id) then raise exception 'TRACK_ACCESS_DENIED'; end if;
  if not private.take_rate(auth.uid(),'jam:ready',120,60) then raise exception 'RATE_LIMITED'; end if;
  update public.jam_participants set status='ready',last_seen=now(),ready_track_id=p_track_id,ready_revision=s.track_revision
    where room_id=p_room_id and user_id=auth.uid();
end $$;

create or replace function public.jam_apply_command(p_room_id uuid,p_command_id uuid,p_type text,
  p_payload jsonb default '{}'::jsonb,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.jam_rooms; s public.jam_room_state; old private.jam_commands;
  v_pos double precision; v_now timestamptz:=clock_timestamp(); v_anchor timestamptz;
  v_track uuid; v_ids uuid[]; v_result jsonb; v_queue uuid; v_duration double precision;
begin
  -- Access mutations take the exclusive counterpart before their row locks.
  -- Both participant permissions stay stable through command commit, including
  -- concurrent playlist sharing/revocation, profile activation and track removal.
  perform pg_advisory_xact_lock_shared(9182026,1);
  select * into r from public.jam_rooms where id=p_room_id for update;
  if not found or not public.jam_is_member(p_room_id) then raise exception 'FORBIDDEN'; end if;
  if p_command_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384 then raise exception 'INVALID_INPUT'; end if;
  select * into old from private.jam_commands where room_id=p_room_id and command_id=p_command_id;
  if found then
    if old.actor_id<>auth.uid() or old.type<>p_type or old.payload<>p_payload then raise exception 'COMMAND_ID_REUSED'; end if;
    return old.result;
  end if;
  if r.status='ended' or r.expires_at<=v_now then raise exception 'ROOM_ENDED'; end if;
  if r.host_id<>auth.uid() and (p_type in ('end_room','set_collaborative','queue_add','queue_remove','queue_reorder','start_at')
    or (not r.collaborative and p_type<>'suggest_track')) then raise exception 'FORBIDDEN'; end if;
  if p_type='suggest_track' and r.guest_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  select * into s from public.jam_room_state where room_id=p_room_id for update;
  if p_expected_revision is null or p_expected_revision<>s.revision then raise exception 'STALE_REVISION'; end if;
  if not private.take_rate(auth.uid(),'jam:command',180,60) then raise exception 'RATE_LIMITED'; end if;
  v_track:=s.track_id;
  v_anchor:=v_now;
  v_pos:=s.position_seconds+case when s.playback_state='playing' then greatest(0,extract(epoch from v_now-s.updated_at)) else 0 end;
  case p_type
    when 'set_track', 'skip_next' then
      if p_type='skip_next' then
        select id,track_id into v_queue,v_track from public.jam_queue where room_id=p_room_id order by position,id limit 1;
        if not found then raise exception 'QUEUE_EMPTY'; end if;
        delete from public.jam_queue where id=v_queue;
      else v_track:=(p_payload->>'track_id')::uuid; end if;
      if v_track is null or not private.room_track_allowed(p_room_id,v_track) then raise exception 'TRACK_ACCESS_DENIED'; end if;
      if p_type='set_track' and p_payload ? 'queue_item_id' then
        delete from public.jam_queue where room_id=p_room_id and id=(p_payload->>'queue_item_id')::uuid and track_id=v_track;
        if not found then raise exception 'INVALID_INPUT'; end if;
      end if;
      v_pos:=coalesce((p_payload->>'position_seconds')::double precision,0);
      s.playback_state:='idle'; s.track_revision:=s.revision+1;
      update public.jam_participants set ready_track_id=null,ready_revision=null,status='buffering' where room_id=p_room_id and status<>'left';
    when 'play', 'start_at' then
      if v_track is null or not private.room_track_allowed(p_room_id,v_track) then raise exception 'TRACK_ACCESS_DENIED'; end if;
      if exists(select 1 from public.jam_participants p where p.room_id=p_room_id
        and p.user_id in (r.host_id,r.guest_id) and (
          p.ready_track_id is distinct from v_track or p.ready_revision is distinct from s.track_revision
          or p.last_seen<v_now-interval '60 seconds' or p.status in ('buffering','reconnecting','disconnected','left','joining'))) then raise exception 'NOT_READY'; end if;
      if p_type='start_at' then
        v_anchor:=case when p_payload ? 'start_at_ms' then to_timestamp((p_payload->>'start_at_ms')::double precision/1000)
          when p_payload ? 'start_at' then (p_payload->>'start_at')::timestamptz else v_now+interval '750 milliseconds' end;
        if v_anchor<v_now+interval '200 milliseconds' or v_anchor>v_now+interval '5 seconds' or not isfinite(v_anchor) then raise exception 'INVALID_INPUT'; end if;
        v_pos:=coalesce((p_payload->>'position_seconds')::double precision,v_pos);
      end if;
      s.playback_state:='playing';
    when 'pause' then s.playback_state:='paused'; -- authoritative elapsed time, never client position
    when 'seek' then
      if v_track is null then raise exception 'TRACK_ACCESS_DENIED'; end if;
      v_pos:=(p_payload->>'position_seconds')::double precision;
    when 'set_collaborative' then
      if jsonb_typeof(p_payload->'collaborative') is distinct from 'boolean' then raise exception 'INVALID_INPUT'; end if;
      update public.jam_rooms set collaborative=(p_payload->>'collaborative')::boolean where id=p_room_id;
    when 'end_room' then
      update public.jam_rooms set status='ended',ended_at=v_now where id=p_room_id;
      s.playback_state:='ended';
    when 'queue_add', 'suggest_track' then
      v_track:=(p_payload->>'track_id')::uuid;
      if v_track is null or not private.room_track_allowed(p_room_id,v_track) then raise exception 'TRACK_ACCESS_DENIED'; end if;
      if (select count(*) from public.jam_queue where room_id=p_room_id)>=200 then raise exception 'QUEUE_FULL'; end if;
      insert into public.jam_queue(room_id,track_id,position,added_by)
        select p_room_id,v_track,coalesce(max(position),0)+1,auth.uid() from public.jam_queue where room_id=p_room_id returning id into v_queue;
      v_track:=s.track_id;
    when 'queue_remove' then
      delete from public.jam_queue where room_id=p_room_id and id=coalesce(p_payload->>'queue_id',p_payload->>'queue_item_id')::uuid;
      if not found then raise exception 'INVALID_INPUT'; end if;
    when 'queue_reorder' then
      if jsonb_typeof(p_payload->'ordered_ids') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
      select coalesce(array_agg(value::uuid),'{}') into v_ids from jsonb_array_elements_text(p_payload->'ordered_ids');
      if cardinality(v_ids)<>(select count(*) from public.jam_queue where room_id=p_room_id)
        or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x)
        or exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.jam_queue q where q.id=x and q.room_id=p_room_id)) then raise exception 'INVALID_INPUT'; end if;
      update public.jam_queue q set position=a.n from unnest(v_ids) with ordinality a(id,n) where q.id=a.id and q.room_id=p_room_id;
    else raise exception 'UNKNOWN_COMMAND';
  end case;
  if p_type in ('queue_add','suggest_track','queue_remove','queue_reorder','set_collaborative','play') and s.updated_at>v_now then
    v_anchor:=s.updated_at; v_pos:=s.position_seconds;
  end if;
  if v_pos is null or v_pos<0 or v_pos>86400 or v_pos::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_INPUT'; end if;
  select duration_seconds into v_duration from public.tracks where id=v_track;
  if v_duration>0 then v_pos:=least(v_pos,v_duration); end if;
  if p_type not in ('pause','end_room','set_track','skip_next','queue_add','suggest_track','queue_remove','queue_reorder','set_collaborative')
    and v_track is not null and not private.room_track_allowed(p_room_id,v_track) then raise exception 'TRACK_ACCESS_DENIED'; end if;
  update public.jam_room_state set track_id=v_track,playback_state=s.playback_state,position_seconds=v_pos,
    revision=s.revision+1,track_revision=s.track_revision,updated_by=auth.uid(),updated_at=v_anchor,
    scheduled_start_at=case when v_anchor>v_now then v_anchor else null end where room_id=p_room_id;
  v_result:=jsonb_build_object('revision',s.revision+1,'queue_id',v_queue,'scheduled_start_at',case when v_anchor>v_now then v_anchor else null end);
  insert into private.jam_commands values(p_room_id,p_command_id,auth.uid(),p_type,p_payload,v_result);
  insert into public.jam_events(room_id,type,actor_id,payload) values(p_room_id,'command.'||p_type,auth.uid(),jsonb_build_object('command_id',p_command_id,'payload',p_payload));
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then raise exception 'INVALID_INPUT';
end $$;

create function public.jam_send_message(p_room_id uuid,p_text text,p_message_id uuid default gen_random_uuid(),p_kind text default 'chat')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.jam_messages; v_name text;
begin
  perform pg_advisory_xact_lock_shared(9182026,1);
  perform 1 from public.jam_rooms where id=p_room_id and status<>'ended' for update;
  if not found or not public.jam_is_member(p_room_id) then raise exception 'FORBIDDEN'; end if;
  if p_message_id is null or p_text is null or length(trim(p_text)) not between 1 and 280 or p_kind is null or p_kind not in ('chat','reaction') then raise exception 'INVALID_INPUT'; end if;
  if p_kind='reaction' and p_text not in ('❤️','❤','👍','🔥','😂','🥰','🎵','👏','💔','✨','😍','🎶') then raise exception 'INVALID_INPUT'; end if;
  select * into m from public.jam_messages where id=p_message_id;
  if found then
    if m.room_id<>p_room_id or m.user_id<>auth.uid() or m.text<>trim(p_text) or m.kind<>p_kind then raise exception 'COMMAND_ID_REUSED'; end if;
    return to_jsonb(m);
  end if;
  if not private.take_rate(auth.uid(),'jam:chat',30,60) then raise exception 'RATE_LIMITED'; end if;
  select display_name into v_name from public.profiles where id=auth.uid();
  insert into public.jam_messages(id,room_id,user_id,name,text,kind)
    values(p_message_id,p_room_id,auth.uid(),v_name,trim(p_text),p_kind) returning * into m;
  return to_jsonb(m);
end $$;

create or replace function public.jam_expire_rooms() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.jam_rooms where status<>'ended' and expires_at<=now() for update skip locked loop
    update public.jam_rooms set status='ended',ended_at=now() where id=r.id;
    update public.jam_room_state set playback_state='ended',revision=revision+1,updated_at=now(),scheduled_start_at=null where room_id=r.id;
  end loop;
end $$;

alter table public.playlists add column revision bigint not null default 0;
create function private.playlist_set_tracks(p_playlist uuid,p_tracks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if jsonb_typeof(p_tracks) is distinct from 'array' or jsonb_array_length(p_tracks)>500 then raise exception 'INVALID_INPUT'; end if;
  select coalesce(array_agg(value::uuid),'{}') into v_ids from jsonb_array_elements_text(p_tracks);
  if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x) then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from unnest(v_ids) x where not public.has_track_access(x)
    or not exists(select 1 from public.tracks t where t.id=x and t.status='ready')) then raise exception 'TRACK_ACCESS_DENIED'; end if;
  delete from public.playlist_tracks where playlist_id=p_playlist;
  insert into public.playlist_tracks(playlist_id,track_id,position) select p_playlist,a.id,a.n from unnest(v_ids) with ordinality a(id,n);
end $$;
create function public.playlist_mutate(p_action text,p_playlist_id uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.playlists; v_ids uuid[]; v_user uuid; v_track uuid; v_id uuid;
begin
  perform pg_advisory_xact_lock(9182026,1);
  if not public.current_is_active() then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768 then raise exception 'INVALID_INPUT'; end if;
  if not private.take_rate(auth.uid(),'playlist:write',60,60) then raise exception 'RATE_LIMITED'; end if;
  if p_action='create' then
    if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 200 or length(coalesce(p_payload->>'description',''))>2000 then raise exception 'INVALID_INPUT'; end if;
    insert into public.playlists(owner_id,name,description) values(auth.uid(),trim(p_payload->>'name'),coalesce(p_payload->>'description','')) returning * into p;
    if p_payload ? 'trackIds' then perform private.playlist_set_tracks(p.id,p_payload->'trackIds'); end if;
    return to_jsonb(p);
  end if;
  select * into p from public.playlists where id=p_playlist_id for update;
  if not found or p.owner_id<>auth.uid() then raise exception 'FORBIDDEN'; end if;
  if p_payload ? 'expectedRevision' and (p_payload->>'expectedRevision')::bigint is distinct from p.revision then raise exception 'STALE_REVISION'; end if;
  case p_action
    when 'update' then
      if p_payload ? 'name' then
        if length(trim(coalesce(p_payload->>'name',''))) not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
        p.name:=trim(p_payload->>'name');
      end if;
      if p_payload ? 'description' then
        if length(coalesce(p_payload->>'description',''))>2000 then raise exception 'INVALID_INPUT'; end if;
        p.description:=coalesce(p_payload->>'description','');
      end if;
      update public.playlists set name=p.name,description=p.description where id=p.id;
      if p_payload ? 'trackIds' then perform private.playlist_set_tracks(p.id,p_payload->'trackIds'); end if;
    when 'add' then
      v_track:=(p_payload->>'trackId')::uuid;
      if not public.has_track_access(v_track) or not exists(select 1 from public.tracks where id=v_track and status='ready') then raise exception 'TRACK_ACCESS_DENIED'; end if;
      if (select count(*) from public.playlist_tracks where playlist_id=p.id)>=500 then raise exception 'PLAYLIST_FULL'; end if;
      insert into public.playlist_tracks(playlist_id,track_id,position)
        select p.id,v_track,coalesce(max(position),0)+1 from public.playlist_tracks where playlist_id=p.id on conflict do nothing;
    when 'remove' then
      delete from public.playlist_tracks where playlist_id=p.id and track_id=(p_payload->>'trackId')::uuid;
    when 'reorder' then
      if jsonb_typeof(p_payload->'trackIds') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
      select coalesce(array_agg(value::uuid),'{}') into v_ids from jsonb_array_elements_text(p_payload->'trackIds');
      if cardinality(v_ids)<>(select count(*) from public.playlist_tracks where playlist_id=p.id)
        or cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x)
        or exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.playlist_tracks pt where pt.playlist_id=p.id and pt.track_id=x)) then raise exception 'INVALID_INPUT'; end if;
      update public.playlist_tracks pt set position=a.n from unnest(v_ids) with ordinality a(id,n) where pt.playlist_id=p.id and pt.track_id=a.id;
    when 'share' then
      v_user:=(p_payload->>'userId')::uuid;
      if not private.active(v_user) or v_user=auth.uid() then raise exception 'INVALID_INPUT'; end if;
      if coalesce((p_payload->>'grantTracks')::boolean,false) and not public.current_is_admin() then raise exception 'FORBIDDEN'; end if;
      insert into public.playlist_permissions(playlist_id,user_id,granted_by,grant_tracks)
        values(p.id,v_user,auth.uid(),coalesce((p_payload->>'grantTracks')::boolean,false))
        on conflict(playlist_id,user_id) do update set grant_tracks=excluded.grant_tracks,granted_by=excluded.granted_by;
    when 'unshare' then
      delete from public.playlist_permissions where playlist_id=p.id and user_id=(p_payload->>'userId')::uuid;
    when 'delete' then
      delete from public.playlists where id=p.id;
      return jsonb_build_object('id',p.id,'deleted',true);
    else raise exception 'INVALID_INPUT';
  end case;
  -- Normalize all positions after every mutation; the playlist row lock
  -- serializes add/remove/reorder and protects against partially applied order.
  with ordered as (select track_id,row_number() over(order by position,track_id) n from public.playlist_tracks where playlist_id=p.id)
    update public.playlist_tracks pt set position=o.n from ordered o where pt.playlist_id=p.id and pt.track_id=o.track_id;
  update public.playlists set updated_at=now(),revision=revision+1 where id=p.id returning * into p;
  return to_jsonb(p);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'INVALID_INPUT';
end $$;

create function public.manage_track_permission(p_track_id uuid,p_user_id uuid,p_grant boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(9182026,1);
  if not public.current_is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_grant is null or not private.active(p_user_id) or not exists(select 1 from public.tracks where id=p_track_id) then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_track_id::text||p_user_id::text,2));
  if not private.take_rate(auth.uid(),'grant:write',60,60) then raise exception 'RATE_LIMITED'; end if;
  if p_grant then
    delete from public.track_revocations where track_id=p_track_id and user_id=p_user_id;
    insert into public.track_permissions(track_id,user_id,granted_by) values(p_track_id,p_user_id,auth.uid())
      on conflict(track_id,user_id) do update set granted_by=excluded.granted_by;
  else
    delete from public.track_permissions where track_id=p_track_id and user_id=p_user_id;
    insert into public.track_revocations values(p_track_id,p_user_id) on conflict do nothing;
  end if;
end $$;

create function public.manage_invitation(p_action text,p_email text default null,p_id uuid default null,p_days integer default 14)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.invitations;
begin
  perform pg_advisory_xact_lock(9182026,1);
  if not public.current_is_admin() then raise exception 'FORBIDDEN'; end if;
  if not private.take_rate(auth.uid(),'invite:write',10,60) then raise exception 'RATE_LIMITED'; end if;
  if p_action='create' then
    if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_days is null or p_days not between 1 and 30 then raise exception 'INVALID_INPUT'; end if;
    perform pg_advisory_xact_lock(hashtextextended(lower(p_email),3));
    update public.invitations set revoked_at=now() where lower(email::text)=lower(p_email) and accepted_at is null and revoked_at is null;
    insert into public.invitations(email,invited_by,expires_at) values(lower(p_email),auth.uid(),now()+make_interval(days=>p_days)) returning * into i;
  elsif p_action='revoke' then
    select * into i from public.invitations where id=p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if i.accepted_user_id=auth.uid() then raise exception 'INVALID_INPUT'; end if;
    update public.invitations set revoked_at=now() where id=i.id returning * into i;
    if i.accepted_user_id is not null then
      update public.profiles set is_active=false where id=i.accepted_user_id and invitation_id=i.id and not is_admin;
    end if;
  else raise exception 'INVALID_INPUT'; end if;
  return to_jsonb(i);
end $$;

create function public.send_chat_message(p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.messages; v_name text;
begin
  if not public.current_is_active() then raise exception 'FORBIDDEN'; end if;
  if p_text is null or length(trim(p_text)) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
  if not private.take_rate(auth.uid(),'chat:write',30,60) then raise exception 'RATE_LIMITED'; end if;
  select display_name into v_name from public.profiles where id=auth.uid();
  insert into public.messages(user_id,sender,text) values(auth.uid(),v_name,trim(p_text)) returning * into m;
  return to_jsonb(m);
end $$;

-- Storage publication is only available to the trusted server after HEAD and
-- bounded Range verification. The actor is checked again within the transaction.
create function public.library_mutate(p_actor uuid,p_action text,p_track_id uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.tracks; u public.upload_intents; v_id uuid; v_size bigint; v_md5 text; v_key text;
begin
  perform pg_advisory_xact_lock(9182026,1);
  if not private.admin(p_actor) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if p_action='create' then
    insert into public.tracks(id,owner_id,title,artist,album,movie,year,tags)
      values(coalesce(p_track_id,gen_random_uuid()),p_actor,p_payload->>'title',coalesce(p_payload->>'artist','Unknown artist'),
        p_payload->>'album',p_payload->>'movie',p_payload->>'year',
        array(select jsonb_array_elements_text(coalesce(p_payload->'tags','[]')))) returning * into t;
    return to_jsonb(t);
  end if;
  select * into t from public.tracks where id=p_track_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  case p_action
    when 'update' then
      update public.tracks set
        title=case when p_payload ? 'title' then p_payload->>'title' else title end,
        artist=case when p_payload ? 'artist' then p_payload->>'artist' else artist end,
        album=case when p_payload ? 'album' then p_payload->>'album' else album end,
        movie=case when p_payload ? 'movie' then p_payload->>'movie' else movie end,
        year=case when p_payload ? 'year' then p_payload->>'year' else year end,
        tags=case when p_payload ? 'tags' then array(select jsonb_array_elements_text(p_payload->'tags')) else tags end,
        duration_seconds=case when p_payload ? 'duration_seconds' then (p_payload->>'duration_seconds')::double precision else duration_seconds end
        where id=t.id returning * into t;
    when 'delete' then
      insert into private.storage_gc(object_key) select k from unnest(array[t.audio_key,t.artwork_key]) k where k is not null on conflict do nothing;
      insert into private.storage_gc(object_key,not_before) select object_key,greatest(expires_at+interval '5 minutes',now()+interval '5 minutes') from public.upload_intents where track_id=t.id on conflict do nothing;
      delete from public.tracks where id=t.id;
      return jsonb_build_object('ok',true);
    when 'reserve_upload' then
      if p_payload->>'kind'='audio' and t.status='ready' then raise exception 'ALREADY_READY'; end if;
      insert into public.upload_intents(track_id,actor_id,kind,object_key,mime_type,expected_bytes,expected_md5,previous_key)
        values(t.id,p_actor,p_payload->>'kind',p_payload->>'key',p_payload->>'mimeType',
          (p_payload->>'sizeBytes')::bigint,p_payload->>'checksumMd5',
          case when p_payload->>'kind'='artwork' then t.artwork_key else t.audio_key end) returning * into u;
      insert into private.storage_gc(object_key,not_before) values(u.object_key,u.expires_at+interval '5 minutes') on conflict do nothing;
      return to_jsonb(u);
    when 'finalize' then
      select * into u from public.upload_intents where id=(p_payload->>'uploadId')::uuid and track_id=t.id for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if u.finalized_at is not null then return to_jsonb(t); end if;
      if u.expires_at<now() then raise exception 'UPLOAD_EXPIRED'; end if;
      v_size:=(p_payload->>'sizeBytes')::bigint; v_md5:=p_payload->>'checksumMd5';
      if v_size is null or v_size<1 or v_size>(case when u.kind='audio' then 209715200 else 10485760 end)
        or v_md5 is null or v_md5 !~ '^[a-f0-9]{32}$'
        or (u.expected_bytes is not null and v_size<>u.expected_bytes)
        or (u.expected_md5 is not null and v_md5<>u.expected_md5) then raise exception 'INVALID_UPLOAD'; end if;
      if u.kind='audio' then
        if t.status='ready' then raise exception 'ALREADY_READY'; end if;
        update public.tracks set audio_key=u.object_key,mime_type=u.mime_type,size_bytes=v_size,checksum_md5=v_md5,status='ready',
          duration_seconds=coalesce((p_payload->>'durationSeconds')::double precision,duration_seconds) where id=t.id returning * into t;
      else
        if t.artwork_key is distinct from u.previous_key then raise exception 'STALE_UPLOAD'; end if;
        update public.tracks set artwork_key=u.object_key where id=t.id returning * into t;
      end if;
      update public.upload_intents set finalized_at=now() where id=u.id;
      delete from private.storage_gc where object_key=u.object_key;
      if u.previous_key is not null then insert into private.storage_gc(object_key) values(u.previous_key) on conflict do nothing; end if;
    else raise exception 'INVALID_INPUT';
  end case;
  return to_jsonb(t);
exception when unique_violation then raise exception 'DUPLICATE';
end $$;

create function public.storage_gc_batch() returns table(object_key text)
language sql security definer set search_path = '' as $$
  select g.object_key from private.storage_gc g where g.not_before<now()
    and not exists(select 1 from public.tracks t where t.audio_key=g.object_key or t.artwork_key=g.object_key)
    and not exists(select 1 from public.upload_intents u where u.object_key=g.object_key and u.finalized_at is null and u.expires_at+interval '5 minutes'>now())
    order by g.created_at limit 100
$$;
create function public.storage_gc_ack(p_key text) returns void
language sql security definer set search_path = '' as $$ delete from private.storage_gc where object_key=p_key $$;

-- Defense against malformed data even through trusted-server code.
alter table public.tracks add constraint tracks_metadata_valid check(
  length(trim(title)) between 1 and 300 and length(artist) between 1 and 300
  and (duration_seconds is null or (duration_seconds>0 and duration_seconds<=86400))
  and cardinality(tags)<=20) not valid;
alter table public.jam_room_state add constraint state_position_valid check(position_seconds>=0 and position_seconds<=86400) not valid;

-- Pin existing helpers too, and remove PUBLIC's default EXECUTE privilege from
-- every owned function. Private helpers are callable only through checked RPCs.
alter function public.current_uid() set search_path = '';
alter function public.server_time() set search_path = '';
alter function public.touch_updated_at() set search_path = '';
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
do $$ declare r record;
begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'current_uid','current_is_admin','current_is_active','has_track_access','has_playlist_access','server_time','touch_updated_at',
      'handle_new_user','accept_invitation','consume_rate_limit','jam_is_member','jam_topic_member','jam_create_room','jam_join_room',
      'jam_leave_room','jam_heartbeat','jam_set_ready','jam_apply_command','jam_send_message','jam_expire_rooms',
      'playlist_mutate','manage_track_permission','manage_invitation','send_chat_message','library_mutate','storage_gc_batch','storage_gc_ack') loop
    execute format('revoke all on function %s from public, anon, authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;
grant execute on function public.current_uid(),public.current_is_admin(),public.current_is_active(),
  public.has_track_access(uuid),public.has_playlist_access(uuid),public.server_time(),public.accept_invitation(),
  public.consume_rate_limit(text),public.jam_is_member(uuid),public.jam_topic_member(),public.jam_create_room(boolean),
  public.jam_join_room(text),public.jam_leave_room(uuid),public.jam_heartbeat(uuid,text),public.jam_set_ready(uuid,uuid,bigint),
  public.jam_apply_command(uuid,uuid,text,jsonb,bigint),public.jam_send_message(uuid,text,uuid,text),
  public.playlist_mutate(text,uuid,jsonb),public.manage_track_permission(uuid,uuid,boolean),
  public.manage_invitation(text,text,uuid,integer),public.send_chat_message(text) to authenticated;
revoke all on sequence public.messages_id_seq,public.jam_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.messages_id_seq,public.jam_events_id_seq to service_role;
create index track_permissions_user_idx on public.track_permissions(user_id,track_id);
create index playlist_permissions_user_idx on public.playlist_permissions(user_id,playlist_id);
create index jam_participants_user_idx on public.jam_participants(user_id,room_id);
do $$ declare t text;
begin
  -- Supabase does not apply row-level membership checks to DELETE payloads.
  -- Queue changes already bump state revision and append a member-readable
  -- event, so publish those authorized signals instead of raw deletions.
  foreach t in array array['jam_queue','tracks'] loop
    if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime drop table public.%I',t);
    end if;
  end loop;
  foreach t in array array['jam_rooms','jam_messages','jam_events'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
commit;
