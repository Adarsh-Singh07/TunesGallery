/** Actual PostgreSQL execution via PGlite, no remote services or secrets.
 * npm install --prefix /tmp/omnirush/adhurekisse-server --no-save --package-lock=false @electric-sql/pglite
 * PGLITE_ROOT=/tmp/omnirush/adhurekisse-server/node_modules/@electric-sql/pglite node --test tests/server/database.test.mjs
 * Auth and Realtime service schemas are minimal local fixtures; their services
 * themselves are not simulated. All four real migrations execute unchanged,
 * including an upgrade with existing rows created under 0001 and 0003.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = process.env.PGLITE_ROOT;
const load = (path, fallback) => import(root ? pathToFileURL(`${root}/dist/${path}`).href : fallback);
const { PGlite } = await load("index.js", "@electric-sql/pglite");
const { pgcrypto } = await load("contrib/pgcrypto.js", "@electric-sql/pglite/contrib/pgcrypto");
const { citext } = await load("contrib/citext.js", "@electric-sql/pglite/contrib/citext");

test("private library forward migrations enforce authentication, RLS and atomic RPC contracts", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto, citext } });
  const host = randomUUID(), guest = randomUUID(), outsider = randomUUID(), inactive = randomUUID();
  const legacyAdmin = randomUUID(), legacyPending = randomUUID(), legacyUnconfirmed = randomUUID();
  const legacyActive = randomUUID(), legacyRevoked = randomUUID(), legacyMissing = randomUUID();
  let legacyBeforeUpgrade;
  const track = randomUUID(), track2 = randomUUID();
  let room, code, playlist, uploadId;
  const admin = (sql, values = []) => { return db.exec("reset role").then(() => db.query(sql, values)); };
  const as = async (user, sql, values = [], role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
    await db.exec(`set role ${role}`);
    return db.query(sql, values);
  };
  const scalar = (result) => Object.values(result.rows[0] ?? {})[0];
  const command = (user, type, payload, revision, id = randomUUID()) => as(user,
    "select public.jam_apply_command($1,$2,$3,$4::jsonb,$5) result", [room, id, type, JSON.stringify(payload), revision]);
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create schema realtime;
      create extension pgcrypto with schema extensions;
      create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,
        is_anonymous boolean default false,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated,service_role;
      create table realtime.messages(id bigint,extension text,topic text);
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to anon,authenticated;
      grant select,insert on realtime.messages to anon,authenticated;
      create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
      create publication supabase_realtime;
    `);
    for (const migration of ["0001_init.sql", "0002_chat_messages.sql", "0003_private_library_hardening.sql", "0004_public_registration.sql"]) {
      await db.exec("reset role");
      const sql = await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8");
      try { await db.exec(sql); }
      catch (error) {
        const position = Number(error.position ?? error.internalPosition ?? 1) - 1;
        throw new Error(`${migration}: ${error.message}; line ${sql.slice(0, position).split("\n").length}; near ${sql.slice(Math.max(0, position - 100), position + 200)}; context ${error.where ?? error.internalQuery ?? ""}`);
      }
      if (migration === "0002_chat_messages.sql") {
        // 0001's unsafe first-user bit is genuine legacy state, not a new-row
        // approximation after the hardening migrations have already run.
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,'legacy-admin@example.test',now())", [legacyAdmin]);
        assert.equal(scalar(await admin("select is_admin from public.profiles where id=$1", [legacyAdmin])), true);
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,'legacy-pending@example.test',now()),($2,'legacy-unconfirmed@example.test',null)", [legacyPending, legacyUnconfirmed]);
      }
      if (migration === "0003_private_library_hardening.sql") {
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,'host@example.test',now())", [host]);
        await admin("update public.profiles set is_admin=true,is_active=true where id=$1", [host]);
        for (const [id, email] of [[legacyActive, "legacy-active@example.test"], [legacyRevoked, "legacy-revoked@example.test"], [legacyMissing, "legacy-missing@example.test"]]) {
          await admin("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, email]);
        }
        for (const [id, email] of [[legacyActive, "legacy-active@example.test"], [legacyRevoked, "legacy-revoked@example.test"]]) {
          const invite = scalar(await as(host, "select public.manage_invitation('create',$1)", [email]));
          assert.equal(scalar(await as(id, "select public.accept_invitation()")), true);
          if (id === legacyRevoked) await as(host, "select public.manage_invitation('revoke',null,$1)", [invite.id]);
        }
        await as(host, "select public.manage_invitation('create','legacy-pending@example.test')");
        await admin("delete from public.profiles where id=$1", [legacyMissing]);
        legacyBeforeUpgrade = (await admin("select * from public.profiles order by id")).rows;
        await admin("delete from private.rate_limits");
      }
    }
    await t.test("upgrade preserves active roles and locks all ambiguous legacy inactive profiles", async () => {
      const upgraded = (await admin("select * from public.profiles order by id")).rows;
      assert.deepEqual(upgraded.map(({ activation_eligible, activation_provenance, ...old }) => {
        assert.equal(activation_eligible, false);
        assert.equal(activation_provenance, "legacy_locked");
        return old;
      }), legacyBeforeUpgrade);
      for (const id of [host, legacyActive]) {
        for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), true);
      }
      assert.equal(scalar(await admin("select is_admin from public.profiles where id=$1", [host])), true);
      await admin("update auth.users set email_confirmed_at=now() where id=$1", [legacyUnconfirmed]);
      for (const id of [legacyAdmin, legacyPending, legacyUnconfirmed, legacyRevoked, legacyMissing]) {
        for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), false);
        assert.equal((await as(id, "select id from public.profiles")).rows.length, 0);
      }
      // Merely retaining 0001's is_admin bit never makes this legacy row active.
      assert.equal(scalar(await as(legacyAdmin, "select public.current_is_admin()")), false);
    });
    await t.test("operator-verified legacy opt-in requires confirmation and clears the old admin bit", async () => {
      await admin("update public.profiles set activation_eligible=true,activation_provenance='operator_verified' where id=$1", [legacyAdmin]);
      await admin("update auth.users set email_confirmed_at=null where id=$1", [legacyAdmin]);
      assert.equal(scalar(await as(legacyAdmin, "select public.activate_account()")), false);
      await admin("update auth.users set email_confirmed_at=now() where id=$1", [legacyAdmin]);
      assert.equal(scalar(await as(legacyAdmin, "select public.accept_invitation()")), true);
      assert.deepEqual((await admin("select is_admin,is_active,activation_eligible,activation_provenance from public.profiles where id=$1", [legacyAdmin])).rows[0], {
        is_admin: false, is_active: true, activation_eligible: false, activation_provenance: "operator_verified",
      });
    });
    await t.test("public registration never bootstraps an administrator when none exists", async () => {
      const id = randomUUID();
      await admin("update public.profiles set is_admin=false where id=$1", [host]);
      try {
        assert.equal(scalar(await admin("select count(*)::int from public.profiles where is_admin")), 0);
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,'no-admin@example.test',now())", [id]);
        assert.equal(scalar(await as(id, "select public.activate_account()")), true);
        assert.equal(scalar(await as(id, "select public.current_is_admin()")), false);
        assert.equal(scalar(await admin("select count(*)::int from public.profiles where is_admin")), 0);
      } finally {
        await admin("update public.profiles set is_admin=true where id=$1", [host]);
      }
    });
    await t.test("metadata cannot grant privileges or activation eligibility to a new account", async () => {
      const id = randomUUID();
      await admin("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'metadata@example.test',now(),$2::jsonb)", [id, JSON.stringify({
        is_admin: true, is_active: true, role: "admin", activation_eligible: true, activation_provenance: "operator_verified", display_name: "M".repeat(100),
      })]);
      assert.deepEqual((await admin("select is_admin,is_active,activation_eligible,activation_provenance,length(display_name) as name_length from public.profiles where id=$1", [id])).rows[0], {
        is_admin: false, is_active: false, activation_eligible: true, activation_provenance: "public_registration", name_length: 80,
      });
      assert.equal(scalar(await as(id, "select public.activate_account()")), true);
      assert.equal(scalar(await as(id, "select public.current_is_admin()")), false);
      await assert.rejects(as(id, "select public.manage_invitation('create','nope@example.test')"), /FORBIDDEN/);
      for (const [id, email] of [[guest, "guest@example.test"], [outsider, "outsider@example.test"], [inactive, "inactive@example.test"]]) {
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, email]);
      }
    });
    await t.test("unconfirmed profiles stay RLS-hidden until Auth confirmation then activate repeatedly", async () => {
      const id = randomUUID();
      await admin("insert into auth.users(id,email,raw_user_meta_data) values($1,'unconfirmed@example.test','{\"email_confirmed_at\":\"2026-01-01\",\"is_active\":true}')", [id]);
      for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), false);
      assert.equal((await as(id, "select id from public.profiles")).rows.length, 0);
      assert.equal(scalar(await admin("select activation_eligible from public.profiles where id=$1", [id])), true);
      await admin("update auth.users set email_confirmed_at=now() where id=$1", [id]);
      for (const rpc of ["activate_account", "accept_invitation", "activate_account"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), true);
      assert.deepEqual((await as(id, "select id,is_active,is_admin,activation_eligible from public.profiles")).rows, [{ id, is_active: true, is_admin: false, activation_eligible: false }]);
      assert.equal(scalar(await admin("select count(*)::int from public.invitations where accepted_user_id=$1", [id])), 0);
      assert.ok((await as(id, "select * from public.jam_create_room()")).rows[0].room_id);
    });
    await t.test("activation holds the 0003 access-mutation lock through transaction completion", async () => {
      await db.exec("begin");
      try {
        assert.equal(scalar(await as(host, "select public.activate_account()")), true);
        assert.equal(scalar(await db.query("select exists(select 1 from pg_locks where locktype='advisory' and classid=9182026 and objid=1 and objsubid=2 and mode='ExclusiveLock' and granted and pid=pg_backend_pid())")), true);
      } finally { await db.exec("rollback"); }
    });
    await t.test("confirmed invited and public accounts activate without metadata privileges", async () => {
      const invite = scalar(await as(host, "select public.manage_invitation('create','guest@example.test')"));
      assert.ok(invite.id);
      // Even a stray admin bit on an eligible inactive row must be cleared.
      await admin("update public.profiles set is_admin=true where id=$1", [guest]);
      assert.equal(scalar(await as(guest, "select public.accept_invitation()")), true);
      assert.equal(scalar(await admin("select is_admin from public.profiles where id=$1", [guest])), false);
      assert.deepEqual((await admin("select accepted_user_id,accepted_at is not null as accepted from public.invitations where id=$1", [invite.id])).rows[0], { accepted_user_id: guest, accepted: true });
      assert.equal(scalar(await admin("select invitation_id from public.profiles where id=$1", [guest])), invite.id);
      // A confirmed user does not need an invitation to listen or start a Jam.
      assert.equal(scalar(await as(outsider, "select public.activate_account()")), true);
      assert.equal(scalar(await admin("select is_active from public.profiles where id=$1", [outsider])), true);
    });
    await t.test("revoking an accepted invitation disables access permanently through both activation RPCs", async () => {
      const invite = scalar(await as(host, "select public.manage_invitation('create','inactive@example.test')"));
      assert.equal(scalar(await as(inactive, "select public.activate_account()")), true);
      await as(host, "select public.manage_invitation('revoke',null,$1)", [invite.id]);
      assert.deepEqual((await admin("select is_active,activation_eligible,activation_provenance from public.profiles where id=$1", [inactive])).rows[0], {
        is_active: false, activation_eligible: false, activation_provenance: "operator_disabled",
      });
      // A new invitation does not override an existing account disable.
      await as(host, "select public.manage_invitation('create','inactive@example.test')");
      for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(inactive, `select public.${rpc}()`)), false);
      assert.equal((await as(inactive, "select * from public.profiles")).rows.length, 0);
    });
    await t.test("operator disables cannot be bypassed by repeated activation or metadata updates", async () => {
      for (const initiallyActive of [true, false]) {
        const id = randomUUID();
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, `${id}@example.test`]);
        if (initiallyActive) assert.equal(scalar(await as(id, "select public.activate_account()")), true);
        // false -> false on a pending profile is also an explicit disable.
        await admin("update public.profiles set is_active=false where id=$1", [id]);
        await admin("update auth.users set raw_user_meta_data='{\"is_active\":true,\"activation_eligible\":true}' where id=$1", [id]);
        for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), false);
        assert.equal(scalar(await admin("select activation_eligible from public.profiles where id=$1", [id])), false);
      }
    });
    await t.test("unusable optional invitations do not prevent new public registration", async () => {
      for (const invalid of ["revoked", "expired", "inactive-issuer"]) {
        const id = randomUUID(), inviteId = randomUUID(), email = `${id}@example.test`;
        await admin("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, email]);
        await admin("insert into public.invitations(id,email,invited_by,revoked_at,expires_at) values($1,$2,$3,$4,$5)", [
          inviteId, email, invalid === "inactive-issuer" ? legacyRevoked : host,
          invalid === "revoked" ? new Date() : null, new Date(Date.now() + (invalid === "expired" ? -60_000 : 60_000)),
        ]);
        assert.equal(scalar(await as(id, "select public.activate_account()")), true);
        assert.equal(scalar(await admin("select invitation_id from public.profiles where id=$1", [id])), null);
        assert.equal(scalar(await admin("select accepted_at from public.invitations where id=$1", [inviteId])), null);
      }
    });
    await t.test("anonymous, absent, banned and email-less Auth identities cannot activate", async () => {
      for (const rpc of ["activate_account", "accept_invitation"]) {
        await assert.rejects(as(null, `select public.${rpc}()`, [], "anon"), /permission denied/);
        assert.equal(scalar(await as(null, `select public.${rpc}()`)), false);
        assert.equal(scalar(await as(randomUUID(), `select public.${rpc}()`)), false);
      }
      for (const [email, anonymous, banned] of [[null, true, false], ["anonymous@example.test", true, false], [null, false, false], [" ", false, false], ["banned@example.test", false, true]]) {
        const id = randomUUID();
        await admin("insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until) values($1,$2,now(),$3,$4)", [id, email, anonymous, banned ? new Date(Date.now() + 60_000) : null]);
        for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(id, `select public.${rpc}()`)), false);
        assert.equal(scalar(await admin("select is_active from public.profiles where id=$1", [id])), false);
      }
      // A missing physical profile has no trusted enrollment provenance.
      const id = randomUUID();
      await admin("insert into auth.users(id,email,email_confirmed_at) values($1,'missing-profile@example.test',now())", [id]);
      await admin("delete from public.profiles where id=$1", [id]);
      assert.equal(scalar(await as(id, "select public.activate_account()")), false);
    });
    await t.test("least-privilege table and function ACLs deny direct bypass", async () => {
      for (const assignment of ["is_admin=true", "is_active=true", "activation_eligible=true", "activation_provenance='operator_verified'", "email='forged@example.test'", "invitation_id=null"]) {
        for (const user of [guest, inactive]) await assert.rejects(as(user, `update public.profiles set ${assignment} where id=$1`, [user]), /permission denied/);
      }
      await assert.rejects(as(guest, "insert into public.profiles(id,email,is_active) values($1,'forged@example.test',true)", [randomUUID()]), /permission denied/);
      for (const fn of ["handle_new_user", "guard_profile_activation_state"]) await assert.rejects(as(guest, `select public.${fn}()`), /permission denied/);
      await assert.rejects(as(guest, "select public.library_mutate($1,'create',$2,'{\"title\":\"stolen\"}')", [guest, track]), /permission denied/);
      await assert.rejects(as(null, "select public.jam_create_room()", [], "anon"), /permission denied/);
      await assert.rejects(as(inactive, "select public.jam_create_room()"), /FORBIDDEN/);
      await assert.rejects(as(guest, "select * from private.rate_limits"), /permission denied/);
      await as(guest, "update public.profiles set display_name='Guest' where id=$1", [guest]);
    });
    await t.test("track access requires grants; Jam membership is not an implicit grant", async () => {
      await admin("insert into public.tracks(id,owner_id,title,status,audio_key,duration_seconds) values($1,$2,'Track one','ready','audio/one.mp3',300),($3,$2,'Track two','ready','audio/two.mp3',300)", [track, host, track2]);
      assert.equal(scalar(await as(guest, "select public.has_track_access($1)", [track])), false);
      await as(host, "select public.manage_track_permission($1,$2,true)", [track, guest]);
      assert.equal(scalar(await as(guest, "select public.has_track_access($1)", [track])), true);
      const result = await as(host, "select * from public.jam_create_room(false)");
      ({ room_id: room, room_code: code } = result.rows[0]);
      assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
      assert.equal((await as(outsider, "select * from public.jam_rooms")).rows.length, 0);
      assert.equal(scalar(await as(guest, "select public.jam_join_room($1)", [code])), room);
      await assert.rejects(command(host, "set_track", { track_id: track2 }, 1), /TRACK_ACCESS_DENIED/);
    });
    await t.test("outsiders cannot vacate the guest or read state", async () => {
      await assert.rejects(as(outsider, "select public.jam_leave_room($1)", [room]), /FORBIDDEN/);
      assert.equal(scalar(await admin("select guest_id from public.jam_rooms where id=$1", [room])), guest);
      assert.equal((await as(outsider, "select * from public.jam_room_state")).rows.length, 0);
      await assert.rejects(as(guest, "insert into public.jam_queue(room_id,track_id,position,added_by) values($1,$2,1,$3)", [room, track, guest]), /permission denied/);
    });
    await t.test("set_track revision and idempotency precede stale-revision detection", async () => {
      const id = randomUUID();
      assert.equal(scalar(await command(host, "set_track", { track_id: track }, 1, id)).revision, 2);
      assert.equal(scalar(await command(host, "set_track", { track_id: track }, 1, id)).revision, 2);
      await assert.rejects(command(host, "set_track", { track_id: track2 }, 2, id), /COMMAND_ID_REUSED/);
      await assert.rejects(command(host, "pause", {}, 1), /STALE_REVISION/);
      await assert.rejects(command(host, "pause", {}, null), /STALE_REVISION/);
      assert.equal(scalar(await admin("select count(*)::int from public.jam_events where type='command.set_track'")), 1);
    });
    await t.test("readiness cannot be forged by heartbeat or stale/foreign RPC", async () => {
      await as(host, "select public.jam_heartbeat($1,'ready')", [room]);
      await as(guest, "select public.jam_heartbeat($1,'ready')", [room]);
      await assert.rejects(command(host, "start_at", {}, 2), /NOT_READY/);
      await assert.rejects(as(outsider, "select public.jam_set_ready($1,$2,2)", [room, track]), /FORBIDDEN/);
      await assert.rejects(as(guest, "select public.jam_set_ready($1,$2,1)", [room, track]), /STALE_REVISION/);
      for (const user of [host, guest]) await as(user, "select public.jam_set_ready($1,$2,2)", [room, track]);
      assert.equal(scalar(await command(host, "start_at", {}, 2)).revision, 3);
      const state = (await admin("select scheduled_start_at,updated_at from public.jam_room_state where room_id=$1", [room])).rows[0];
      assert.ok(state.scheduled_start_at);
      assert.equal(state.scheduled_start_at.getTime(), state.updated_at.getTime());
    });
    await t.test("host-only queue, guest suggestions and exact atomic reorder", async () => {
      await assert.rejects(command(guest, "queue_add", { track_id: track }, 3), /FORBIDDEN/);
      const one = scalar(await command(host, "queue_add", { track_id: track }, 3));
      const two = scalar(await command(guest, "suggest_track", { track_id: track }, 4));
      await assert.rejects(command(host, "queue_reorder", { ordered_ids: [one.queue_id, one.queue_id] }, 5), /INVALID_INPUT/);
      await command(host, "queue_reorder", { ordered_ids: [two.queue_id, one.queue_id] }, 5);
      assert.deepEqual((await as(guest, "select id from public.jam_queue order by position")).rows.map((r) => r.id), [two.queue_id, one.queue_id]);
      await command(host, "queue_remove", { queue_item_id: one.queue_id }, 6);
      await assert.rejects(command(host, "seek", { position_seconds: "NaN" }, 7), /INVALID_INPUT/);
      await command(host, "set_collaborative", { collaborative: true }, 7);
      await command(guest, "pause", { position_seconds: 9999 }, 8);
      assert.ok(scalar(await admin("select position_seconds from public.jam_room_state where room_id=$1", [room])) < 300);
      const scheduled = new Date(Date.now() + 4000).toISOString();
      await command(host, "start_at", { start_at: scheduled }, 9);
      await command(host, "queue_add", { track_id: track }, 10);
      await command(host, "play", {}, 11);
      assert.equal(scalar(await admin("select updated_at from public.jam_room_state where room_id=$1", [room])).toISOString(), scheduled);
      await assert.rejects(command(host, "set_track", { track_id: track, queue_item_id: randomUUID() }, 12), /INVALID_INPUT/);
      await command(host, "set_track", { track_id: track, queue_item_id: two.queue_id, position_seconds: 0 }, 12);
      assert.equal((await as(guest, "select id from public.jam_queue where id=$1", [two.queue_id])).rows.length, 0);
    });
    await t.test("chat binds identity, is idempotent and is invisible to outsiders", async () => {
      const id = randomUUID();
      const m = scalar(await as(guest, "select public.jam_send_message($1,'hello',$2,'chat')", [room, id]));
      assert.equal(m.user_id, guest); assert.equal(m.name, "Guest");
      assert.equal(scalar(await as(guest, "select public.jam_send_message($1,'hello',$2,'chat')", [room, id])).id, id);
      await assert.rejects(as(host, "select public.jam_send_message($1,'hello',$2,'chat')", [room, id]), /COMMAND_ID_REUSED/);
      assert.equal((await as(outsider, "select * from public.jam_messages")).rows.length, 0);
    });
    await t.test("private Realtime policies authorize only current members and deny identity-sensitive publication", async () => {
      assert.equal(scalar(await admin("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename in ('jam_queue','tracks')")), 0);
      assert.equal(scalar(await admin("select count(*)::int from pg_publication_tables where pubname='supabase_realtime' and tablename='jam_events'")), 1);
      await admin("insert into realtime.messages values(1,'broadcast',$1)", [`jam:${room}`]);
      await admin("select set_config('realtime.topic',$1,false)", [`jam:${room}`]);
      assert.equal(scalar(await as(guest, "select public.jam_topic_member()")), true);
      assert.equal((await as(guest, "select * from realtime.messages")).rows.length, 1);
      assert.equal((await as(outsider, "select * from realtime.messages")).rows.length, 0);
      // Simulate a pre-existing permissive project policy: restrictive guards
      // must still block member writes and outsider reads on application topics.
      await admin("create policy old_read on realtime.messages for select to authenticated using(true)");
      await admin("create policy old_write on realtime.messages for insert to authenticated with check(true)");
      assert.equal((await as(outsider, "select * from realtime.messages")).rows.length, 0);
      await assert.rejects(as(guest, "insert into realtime.messages values(2,'presence',$1)", [`jam:${room}`]), /row-level security/);
    });
    await t.test("playlist full replacement is atomic and shared metadata does not automatically grant tracks", async () => {
      const p = scalar(await as(host, "select public.playlist_mutate('create',null,$1::jsonb)", [JSON.stringify({ name: "Mix", trackIds: [track, track2] })]));
      playlist = p.id;
      await as(host, "select public.playlist_mutate('share',$1,$2::jsonb)", [playlist, JSON.stringify({ userId: guest, grantTracks: false })]);
      assert.equal((await as(guest, "select * from public.playlists where id=$1", [playlist])).rows.length, 1);
      assert.equal((await as(guest, "select * from public.playlist_tracks where playlist_id=$1", [playlist])).rows.length, 1);
      await assert.rejects(as(guest, "select public.playlist_mutate('delete',$1)", [playlist]), /FORBIDDEN/);
      await assert.rejects(as(host, "select public.playlist_mutate('update',$1,$2::jsonb)", [playlist, JSON.stringify({ name: "Wrong", trackIds: [track, track] })]), /INVALID_INPUT/);
      assert.equal(scalar(await admin("select name from public.playlists where id=$1", [playlist])), "Mix");
    });
    await t.test("playlist-derived playback grants revoke immediately; explicit deny wins over playlist grants", async () => {
      await as(host, "select public.playlist_mutate('share',$1,$2::jsonb)", [playlist, JSON.stringify({ userId: guest, grantTracks: true })]);
      assert.equal(scalar(await as(guest, "select public.has_track_access($1)", [track2])), true);
      await as(host, "select public.manage_track_permission($1,$2,false)", [track2, guest]);
      assert.equal(scalar(await as(guest, "select public.has_track_access($1)", [track2])), false);
      await as(host, "select public.playlist_mutate('unshare',$1,$2::jsonb)", [playlist, JSON.stringify({ userId: guest })]);
      assert.equal((await as(guest, "select * from public.playlists where id=$1", [playlist])).rows.length, 0);
    });
    await t.test("artwork reservation preserves live pointer and concurrent replacements use compare-and-swap", async () => {
      await admin("update public.tracks set artwork_key='artwork/old.jpg' where id=$1", [track]);
      const reserve = async (key) => scalar(await as(null, "select public.library_mutate($1,'reserve_upload',$2,$3::jsonb)", [host, track, JSON.stringify({ kind: "artwork", key, mimeType: "image/jpeg" })], "service_role"));
      const u1 = await reserve("artwork/new1.jpg"), u2 = await reserve("artwork/new2.jpg");
      uploadId = u1.id;
      assert.equal(scalar(await admin("select artwork_key from public.tracks where id=$1", [track])), "artwork/old.jpg");
      const finish = (u) => as(null, "select public.library_mutate($1,'finalize',$2,$3::jsonb)", [host, track, JSON.stringify({ uploadId: u.id, sizeBytes: 100, checksumMd5: "a".repeat(32) })], "service_role");
      await finish(u1);
      await assert.rejects(finish(u2), /STALE_UPLOAD/);
      assert.equal(scalar(await admin("select artwork_key from public.tracks where id=$1", [track])), "artwork/new1.jpg");
      assert.ok((await admin("select * from private.storage_gc where object_key='artwork/old.jpg'")).rows.length);
    });
    await t.test("content checksum duplicates race safely at the unique constraint", async () => {
      const id = randomUUID();
      await admin("update public.tracks set checksum_md5=$1,size_bytes=100 where id=$2", ["b".repeat(32), track]);
      await as(null, "select public.library_mutate($1,'create',$2,'{\"title\":\"different name same bytes\"}')", [host, id], "service_role");
      const u = scalar(await as(null, "select public.library_mutate($1,'reserve_upload',$2,$3::jsonb)", [host, id, JSON.stringify({ kind: "audio", key: "audio/duplicate.mp3", mimeType: "audio/mpeg" })], "service_role"));
      await assert.rejects(as(null, "select public.library_mutate($1,'finalize',$2,$3::jsonb)", [host, id, JSON.stringify({ uploadId: u.id, sizeBytes: 100, checksumMd5: "b".repeat(32) })], "service_role"), /DUPLICATE/);
      assert.equal(scalar(await admin("select status from public.tracks where id=$1", [id])), "pending");
    });
    await t.test("persistent limiter returns exactly the allowed number under queued concurrent requests", async () => {
      await as(guest, "select 1");
      const results = await Promise.all(Array.from({ length: 75 }, () => db.query("select public.consume_rate_limit('write')")));
      assert.equal(results.filter((r) => scalar(r) === true).length, 60);
      assert.equal(scalar(await admin("select hits from private.rate_limits where user_id=$1 and bucket='api:write'", [guest])), 61);
    });
    await t.test("invalid join attempts commit their rate-limit increment", async () => {
      for (let i = 0; i < 25; i++) assert.equal(scalar(await as(outsider, "select public.jam_join_room('NOPE00')")), null);
      assert.equal(scalar(await admin("select hits from private.rate_limits where user_id=$1 and bucket='jam:join'", [outsider])), 21);
    });
    await t.test("guest leave revokes all room reads, rejoin is idempotent and expiry denies controls", async () => {
      await as(guest, "select public.jam_leave_room($1)", [room]);
      assert.equal((await as(guest, "select * from public.jam_room_state")).rows.length, 0);
      assert.equal(scalar(await as(guest, "select public.jam_join_room($1)", [code])), room);
      assert.equal(scalar(await as(guest, "select public.jam_join_room($1)", [code])), room);
      await admin("update public.jam_rooms set expires_at=now()-interval '1 minute' where id=$1", [room]);
      await assert.rejects(command(host, "pause", {}, 99), /FORBIDDEN|ROOM_ENDED/);
    });
    await t.test("service cleanup never selects referenced objects and inactive profiles lose library access", async () => {
      await admin("update private.storage_gc set not_before=now()-interval '1 minute'");
      await admin("update public.upload_intents set expires_at=now()-interval '1 minute'");
      const batch = await as(null, "select * from public.storage_gc_batch()", [], "service_role");
      assert.ok(batch.rows.some((r) => r.object_key === "artwork/old.jpg"));
      assert.ok(!batch.rows.some((r) => r.object_key === "artwork/new1.jpg"));
      await admin("update public.profiles set is_active=false where id=$1", [guest]);
      assert.equal((await as(guest, "select * from public.tracks")).rows.length, 0);
      await assert.rejects(as(guest, "select public.send_chat_message('hello')"), /FORBIDDEN/);
      for (const rpc of ["activate_account", "accept_invitation"]) assert.equal(scalar(await as(guest, `select public.${rpc}()`)), false);
    });
  } finally { await db.close(); }
});
