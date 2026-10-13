# Jam audit and integration contract

## Initial audit (2026-10-03)

Reviewed `lib/jam/*`, `components/jam/JamPanel.tsx`, the three existing Jam unit suites, the PlaybackManager integration (read-only), and `supabase/migrations/0001_init.sql` before implementation.

- Client accepted older/equal revisions and raced asynchronous loads; paused seeks and same-state track changes were missed. Existing command tests used camelCase fake rows instead of the database's snake_case rows, concealing these failures.
- Readiness did not record the local participant; default Broadcast excludes the sender. Signals were not revision-scoped. `start_at` did not actually schedule playback in SQL or in the client.
- Clock sampling ran after playback began. Drift ignored supplied thresholds, buffering, uncertainty, and cooldown. The hook's position mirror missed manager time-only notifications.
- Reconnect timers were untracked/duplicated; subscriptions lacked room filters and a `jam_rooms` subscription. There was no visibility/resume recovery. Bootstrap failures escaped the hook. Room metadata and guest membership could remain stale.
- Remote play cancelled a local sleep timer. Guest provider `ended` automatically advanced the solo playlist. Ended rooms did not fully release Jam ownership.
- Queue suggestion reused an insert denied to non-collaborative guests. Reordering was non-atomic and ignored errors. Chat lacked own-message echo, deduplication, delivery errors, and private-channel authorization.
- SQL logs command IDs but does not deduplicate them, checks track access only for the actor, permits unsafe queue updates, and lacks `jam_rooms` publication/private Realtime policies. `jam_leave_room` needs membership validation and revision increments. These are DB-agent responsibilities.

## Research used

- [Supabase Presence](https://supabase.com/docs/guides/realtime/presence): `sync` is a merged snapshot, not proof of a human join/leave; track slow-changing state after `SUBSCRIBED`.
- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast): self-echo is opt-in; ACK means server receipt, not peer delivery. Client broadcasts are ephemeral.
- [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): `private: true` plus `realtime.messages` SELECT/INSERT policies are required for Broadcast/Presence; Postgres table RLS separately protects row changes. Topic authorization is cached until reconnect/JWT renewal.
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): publish subscribed tables, filter room-specific changes, recover deleted/missed data through authoritative reads.
- [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api): timers/fetch callbacks can freeze; mobile termination need not fire unload. Use visibility, pageshow, freeze/resume; fetch current state after returning, never infer room end from hidden/disconnected Presence.

## DB-agent contract (existing RPC names retained)

`jam_create_room(p_collaborative)`, `jam_join_room(p_code)`, `jam_leave_room(p_room_id)`, `jam_heartbeat(p_room_id,p_status)`, `server_time()`, and `jam_apply_command(p_room_id,p_command_id,p_type,p_payload,p_expected_revision)` retain their names/signatures.

The DB agent added `0003_private_library_hardening.sql` during this work. The client now follows that migration, including its identity-bound RPCs and prohibition on client Broadcast/Presence publication. The original RPC names/signatures remain compatible; `0001_init.sql` alone is insufficient for the new client.

`jam_apply_command` behavior used by the client:

1. Atomically deduplicate `(room_id, command_id)` **before** stale-revision rejection (including retries after end); bind IDs to actor and original command. Return original result for retries. Increment revision for every mutation, including queue commands; concurrent writers reject stale expected revisions.
2. `start_at`: accept `{ position_seconds, start_at: <ISO server timestamp> }`. Clamp/validate the future lead, store the playback anchor in existing `updated_at` (or expose `start_at`/`scheduled_start_at`, which the client also understands). `playing` means scheduled until that instant. `play` must preserve the current server-derived position; `pause` without a client position must freeze the server timeline. Metadata/queue commands must not rewind that timeline.
3. Queue commands: `queue_add {track_id}`, `queue_remove {queue_item_id}`, `queue_reorder {ordered_ids: uuid[]}`, `suggest_track {track_id}`. Host manages queue; guest suggestion inserts a queue entry with `added_by = auth.uid()` (UI labels guest entries suggestions). Validate full reorder permutation and execute atomically. Direct writes are prohibited. Explicit next uses `skip_next {}` to atomically consume the first queue entry, so duplicate track IDs do not create loops. Playback remains host-or-collaborative-guest; only host ends room/changes mode/automatically advances.
4. Track selection and queue/suggestion acceptance must enforce access for **both** current listeners in the DB, including ready track status. Invitation alone must not grant an entire private library. Validate guest admission against the shared track as well.
5. Publish `jam_rooms` alongside state/queue/participants. All timeline mutations and room endings must advance revision; expiration/host leave must be visible through room status. Return ended rooms to existing members long enough to recover the terminal state.
6. Private topic `jam:<room UUID>` is receive-only for members. The client never publishes Broadcast or Presence payloads. Participant state comes from identity-bound `jam_heartbeat` and table changes; connection indicators describe recent heartbeat freshness, not a guaranteed live socket. There is no public-channel fallback.

Additional extensions supplied by `0003` and now used:

- `jam_set_ready(p_room_id,p_track_id,p_expected_revision)` records the authenticated listener's readiness. The client matches `ready_track_id` and `ready_revision` against state `track_id` / `track_revision`; unrelated queue revisions do not invalidate preparation. Readiness is fetched after acknowledgment and after subscription/recovery.
- `jam_send_message(p_room_id,p_text,p_message_id,p_kind)` binds chat/reaction identity to the authenticated actor. The client displays a local sending/sent/failed message, merges its authoritative echo by ID, subscribes to `jam_messages` INSERTs, and recovers the most recent 100 messages after reconnect. These messages are durable private room records, rather than ephemeral Broadcasts.
- `start_at` has a bounded readiness attempt (default five seconds) and server-time lead (1.2–3 seconds, based on RTT). `0003` rejects `NOT_READY` rather than forcing a slow/disconnected peer. After timeout, the UI explains the blocker; a later authoritative readiness change can start the room. There is no unbounded retry timer.

### Remaining DB extension requested explicitly

For `set_track`, accept optional **`p_payload.queue_item_id`** and atomically delete that queue row after verifying it belongs to the room and its `track_id` matches the requested track. This is a playback selection, so a collaborative guest may select/consume that item while general queue add/remove/reorder stay host-only. The client already sends this key. The current `0003` ignores it: the host has a compatible post-selection `queue_remove` fallback, but a collaborative guest's selected item remains queued until the host removes it. This extension eliminates that final non-atomic host fallback and guest replay limitation. No new RPC name or table is required.

## Client implementation

- Monotonic server-clock anchor; min-RTT sampling rejects invalid/suspended samples, bounds requests, retains useful rounds when individual rounds fail, and aborts on disposal. All starts are computed from the DB anchor; future nonzero starts hold the reference position.
- Strictly increasing revisions; duplicate/older snapshots are rejected before player work. One coalescing playback worker prevents a late load from playing superseded state. Paused seeks, playing track changes, and recovery at the same revision are handled.
- Serialized commands, same-ID/same-payload/same-revision retry for ambiguous transport failures, no stale-command replay. Permission decisions are enforced both by the client affordances and the DB RPCs.
- Drift respects custom thresholds, RTT uncertainty, readiness/buffering, hidden pages, sleep, and connection state. Hard seeks have an eight-second cooldown; nudges are bounded to ten-second windows and ±3%, with serialized rate reset on pause/disconnect/disposal. Small rate changes are not guaranteed inaudible on every device.
- One room-filtered channel and one owned backoff timer (exponential, jittered, capped at 30 seconds). Fetch again after `SUBSCRIBED` to close the read/subscribe gap, every 20 seconds while visible, and on online/visibility/pageshow/resume. Freeze/pagehide detach the channel; return fetches current state. Old-channel callbacks are inert. Disconnect/end/disposal do not pause or destroy already buffered audio.
- Sleep timers affect only local playback and survive remote commands; deadline checks catch delayed/frozen timer callbacks. Local wake catches up to the shared timeline. Only the host consumes provider-ended into an authoritative next command; guests never advance locally.
- Room status/end/revoked membership/known expiry release Jam ownership and restore solo transport. The currently buffered track continues; this does not restore a pre-Jam playlist position or acquire a new stream permission after the room ends.
- Cinematic CSS-module panel includes mobile/safe-area layouts, 44px targets, participant/preparation/reconnection/audio-gesture states, guest suggestions, host queue reorder, chat delivery state, per-user sleep countdown, reduced-motion behavior, dialog focus containment/return, and Escape dismissal.

## Exact PlaybackManager / main integration requirements

The hook checks for this API before creating/joining a room. Type exported from `lib/jam/transport.ts` (also re-exported by `useJam.ts`):

```ts
setTransportHandlers(handlers: {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  ended: () => Promise<void>;
} | null): void | (() => void);
```

1. Route Media Session play/pause/stop/seek/next/previous and provider-ended through the installed handlers. An installed handler consumes the event even if it resolves without a mutation (read-only guest), or reports an error. **Never fall back to solo next while `ended` is installed.** Prefer returning an ownership-scoped disposer so a late cleanup cannot remove another owner's handlers; null restores solo behavior.
2. Keep direct `selectSong(index,false)`, `play()`, `pause()`, `seek()`, and `setRate()` as local provider operations. The Jam adapter uses these to apply authoritative state; rerouting them through the override would recurse. Existing manager `getState()` must provide the latest time even when only time subscribers are notified; the adapter reads it directly.
3. `selectSong(index,false)` must cue/preload the actual requested R2 track without audible playback or temporarily resuming the previous track on provider switch. It must reset stale duration/loading state. `play()`/cue should expose failure in `getState().hasError/errorMessage` (or reject), and `isPlaying` must reflect successful playback so the UI can show Enable audio. Rate changes should preserve pitch where the browser supports it.
4. Ensure R2 readiness reflects playable data (`canplay`/readyState), not just `loadedmetadata`. The current adapter has only `isLoading`, `hasError`, and positive `duration`; a public `isBuffered()`/`readyState` surface would allow a stronger handshake. Provider cue/load needs a bounded timeout and stale-load cancellation for never-settling loads; the engine can prevent a settled stale load from playing but cannot cancel provider internals with the current API.
5. In `MusicRoom`, route shared next to `jam.actions.next()` (atomic `skip_next`), previous to `jam.actions.previous()`, ended to the manager override, and all shared play/seek/track choices through Jam actions. Keep volume/mute local. Refresh/provide the private library when a shared track is not yet in `songs`; `useJam` retries track resolution when `songs` changes. Show the Jam panel/audio-enable affordance for a device needing a gesture.

The hook installs exactly one override/listener through `attachJamTransport`, cleans them on leave, remote end, bootstrap failure, and unmount, and does not duplicate Media Session handlers itself.

## Verification and limitations

- Meaningful unit tests use snake_case PostgREST rows, DB revision/idempotency/readiness/permission semantics, controllable Realtime callbacks, and fake lifecycle timers. Coverage includes command serialization, ambiguous-commit retry, stale recovery, out-of-order/deduplicated revisions, slow-load supersession, nonzero scheduled starts/cancellation, bounded NOT_READY and late readiness, host/guest controls, atomic reorder/next, both-listener denial, reconnect coalescing, visibility/freeze recovery, audio continuity, seek cooldown/buffering, local sleep/wake, durable chat recovery/delivery, and transport cleanup/solo restoration.
- Run command: `NODE_PATH=/tmp/omnirush/node_modules npm run test -- tests/unit/clock.test.ts tests/unit/timeline.test.ts tests/unit/jamCommands.test.ts` — **68 tests passed** (37 session/transport, 20 timeline, 11 clock). Linux Rollup/esbuild optional binaries were absent from this Windows-mounted install; matching binaries were installed only under the approved temporary directory, without changing project manifests/lockfiles.
- `npm run typecheck -- --incremental false`: no Jam errors; full-project check is blocked by `components/private-library/PrivateLibrary.tsx` importing missing `../PlaybackContext` (outside this ownership scope).
- No live Supabase/R2 calls, migration application, device/browser playback checks, or environment-secret reads were performed. Unit tests validate the client contract; actual SQL behavior/migration checks are owned by the DB agent.
- Browser autoplay, audio buffering/output latency, asymmetric network paths, Bluetooth latency, throttled/frozen JavaScript, and OS/browser termination prevent a sample-accurate or always-on guarantee. A frozen page cannot execute commands or auto-next. Audio that the OS allows may continue; returning fetches authoritative state and catches up. Full page reload does not automatically rejoin a room or persist a personal sleep timer.
- A host disconnect does not elect the guest or end the room. It preserves buffered audio, but no automatic next occurs until the host recovers. This is intentional two-person authority semantics.
