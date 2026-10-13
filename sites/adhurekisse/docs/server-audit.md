# Adhure Kisse server audit and integration contract

Scope: this site's forward migration, server helpers, API routes, `lib/auth.ts`, and server tests. No production changes or `.env.local` inspection. SQL/API hardening is implemented; hosted Auth/R2/Realtime acceptance still needs a separate test deployment.

## Audit findings

Audited both existing migrations, every existing `app/api` route, both `lib/server` modules, `lib/auth.ts`, `/login`, JamSession's database interfaces, `.env.example`, site Vercel instructions, and root `docs/{DEPLOYMENT,ADMIN-GUIDE,LIMITATIONS}.md`.

The old implementation auto-promoted the first Auth user, created profiles without invitations, exposed all profiles/open rooms, granted media access via Jam membership, allowed non-members to vacate rooms, did not deduplicate command IDs, trusted readiness/identity broadcasts, allowed direct queue changes, and exposed unauthenticated in-memory chat. Uploads reused writable keys, trusted HEAD metadata, published artwork before verification, and leaked database errors. There was no persistent rate limiting or normalized playlist sharing API. Root documentation about first-user administration, one-hour streams, public Realtime topics as capabilities, and HEAD-only verification is superseded for this site.

## Jam agent integration contract

Existing signatures retained: `jam_create_room(p_collaborative) -> [{room_id,room_code}]`, `jam_join_room(p_code) -> uuid`, `jam_leave_room(p_room_id)`, `jam_heartbeat(p_room_id,p_status)`, `jam_apply_command(p_room_id,p_command_id,p_type,p_payload,p_expected_revision) -> jsonb`, and `server_time()`.

- All writes require an active invited profile. Joining does not grant tracks: both participants must independently have playback permission. Jam writes hold a shared authorization advisory lock; grant/playlist/invitation/library mutations take its exclusive counterpart before their row locks, keeping access checks stable through commit when those APIs race each other. Trusted direct SQL operators remain responsible for applying access changes deliberately.
- `jam_apply_command` requires a non-null expected revision and command UUID. Same ID + actor/type/payload returns the original result (before the stale-revision check); changed content returns `COMMAND_ID_REUSED`. Every successful command increments state revision. Existing play/pause/seek/set_track/start_at/set_collaborative/end_room types remain.
- Queue writes use the same command RPC: host-only `queue_add {track_id}`, `queue_remove {queue_id}` (also accepts `queue_item_id`), `queue_reorder {ordered_ids: uuid[]}`; `skip_next {}` requires host or collaborative guest. Reorder must contain exactly all current queue IDs once. Guest-only `suggest_track {track_id}` safely appends a suggestion even in host-only mode. Direct table writes are denied.
- The current client can also advance atomically with `set_track {track_id,position_seconds:0,queue_item_id}`; the selected queue item must belong to this room and match the track, then it is consumed within the same revision-checked transaction.
- Readiness: `jam_set_ready(p_room_id,p_track_id,p_expected_revision) -> void`. Read state, load the track, then submit its observed revision. Participants gain `ready_track_id` and `ready_revision`; state gains `track_revision`. The server checks both participants' fresh readiness before play/start_at. A heartbeat `ready` alone is not readiness authorization. Use `jam_heartbeat` for liveness/status only.
- State gains nullable `scheduled_start_at`. Host-only `start_at` defaults to server time + 750ms; optional `start_at_ms` or ISO `start_at` must be 200–5000ms ahead. `updated_at` is also the future timeline anchor for backward-compatible position math. Queue/collaboration changes preserve a pending scheduled anchor. Do not actually play before the scheduled time. `NOT_READY` is retryable after peers report readiness; there is no readiness timeout bypass.
- Chat/reactions: `jam_send_message(p_room_id,p_text,p_message_id,p_kind)` (`p_kind` = `chat` or `reaction`) returns the persisted row. Subscribe/read `jam_messages` (`id,room_id,user_id,name,text,kind,created_at`). Identity and timestamp are assigned by the database. Do not send client broadcasts or trust Presence names/IDs.
- Private channel topic remains `jam:<room UUID>` with `config.private: true`. Membership authorizes receiving; client broadcast/Presence publication on Jam topics is denied. Use `jam_participants` heartbeat rows as authenticated presence. Published Jam tables are rooms, state, participants, messages and events. **Re-fetch the queue after a state revision update, or subscribe to `jam_events` INSERT with `room_id=eq.<uuid>` and re-fetch on `command.queue_*`, `command.suggest_track` or `command.skip_next`.** Raw `jam_queue` and `tracks` are removed from the publication: Supabase cannot apply membership RLS to DELETE payloads. Re-fetch authoritative data after reconnect; REST remains the library authority.
- SQL errors are stable codes including `FORBIDDEN`, `ROOM_ENDED`, `STALE_REVISION`, `COMMAND_ID_REUSED`, `TRACK_ACCESS_DENIED`, `NOT_READY`, `INVALID_INPUT`, `RATE_LIMITED`, `QUEUE_EMPTY`, `QUEUE_FULL`, `UNKNOWN_COMMAND`.
- Creation still generates **six-character** codes. Join returns the UUID on success/rejoin, **NULL** for unavailable/invalid/full/unauthorized-track rooms or an exhausted join limiter. Check null before constructing a session. This is intentional: unsuccessful attempts must commit their limiter increment; raising an exception would roll it back. Treat null as a generic unavailable-room error.

Integration review confirmed the concurrently updated Jam client calls these readiness/message RPCs, uses the compatibility queue fields and ISO schedule, rejects null joins, and refetches room/queue metadata on state revision updates. The playlist editor's `title`, collection PATCH/DELETE and full ordered `trackIds` contracts are supported by the server aliases. This is code-contract verification, not a live multi-device/hosted service test.

## Official references consulted

- Supabase [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless): OTP defaults to creating users; set `shouldCreateUser:false`, configure the OTP email template and redirect allowlist.
- Supabase [password auth](https://supabase.com/docs/guides/auth/passwords): confirmation and server Auth checks.
- Supabase [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): grants and policies both matter; service credentials bypass RLS; untrusted user metadata is not authorization.
- Supabase [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization): private channels plus `realtime.messages` policies, disable public access in the dashboard; authorization caches until token refresh/expiry. Do not ALTER the managed realtime table.
- Cloudflare [presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/): URLs are reusable bearer credentials; PUT supports Content-MD5 and conditional If-None-Match; GET supports Range/If-Match; CORS is separate from authorization.
- Cloudflare [upload objects / ETags](https://developers.cloudflare.com/r2/objects/upload-objects/) and Supabase [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): multipart checksums differ; DELETE delivery cannot enforce row membership, so raw queue/track deletion feeds are withdrawn.

## Migration, authentication and operational setup

Apply `supabase/migrations/0003_private_library_hardening.sql` **after 0001 and 0002** in a test deployment first. It is one transaction. It does not rewrite the older migrations. Tables retain their original names/columns; new metadata includes:

- `profiles.is_active`, `profiles.invitation_id`; `invitations.accepted_user_id`, `revoked_at`.
- `tracks.checksum_md5`; unique `(checksum_md5,size_bytes)` for ready, checksummed tracks.
- `playlist_permissions` and explicit `track_revocations`; `playlists.revision`.
- Server-only `upload_intents`; private `rate_limits`, `jam_commands`, `storage_gc`.
- Jam readiness/scheduling columns and member-readable `jam_messages`.

**Legacy profiles start inactive.** Verify the intended owner's Auth UUID independently, then deliberately provision that one owner via a trusted SQL/service operator:

```sql
update public.profiles
set is_admin = true, is_active = true
where id = '<verified-owner-auth-uuid>'::uuid;
```

Do not activate every legacy row or infer ownership from creation order. The old admin bit remains ineffective while inactive; invitation acceptance always clears it. Re-invite verified ordinary users. Auth accounts predating migration 0001 that lack a profile need explicit provisioning by the operator; the migration does not invent owners or scan/create legacy accounts.

Disable public signup and anonymous Auth users in Supabase, keep email confirmation on, configure the site/redirect URL allowlist, and use an OTP email template containing `{{ .Token }}` for the existing six-digit login form. `/login` must call `accept_invitation()` after session verification; `lib/auth.ts#getProfile` and server `requireUser` also use it. The RPC binds activation to the **confirmed email in `auth.users`**, a pending unexpired/non-revoked invitation and its active administrator issuer. Codes are administrative references, not a bypass for email proof. Acceptance does not grant any tracks.

`POST /api/invitations` creates the DB invitation and attempts Supabase Admin email invitation with the server key. Its `delivery` is `sent`, `existing_account` or `pending`; `pending` is not a claim that email was delivered. SMTP/Auth delivery and the DB transaction cannot be atomic across services. The record remains visible/retryable; an operator can provision the Auth email when needed. `DELETE /api/invitations?id=...` marks it revoked and deactivates an ordinary profile activated by that same invitation. Explicit operator-created admins must be deactivated through the trusted operator path.

Turn off **Allow public access** in Supabase Realtime settings. Use private channels and refreshed JWTs. Database membership and APIs reject a revoked/inactive user immediately; Supabase's channel authorization cache can persist until token refresh/expiry. Use a short JWT expiration window and rejoin after membership changes. Client-originated publication on Jam topics is denied even if an old permissive project policy exists (restrictive guards).

Keep R2 bucket public access disabled, including `r2.dev` and public custom domains. Restrict the R2 credential to this bucket. Configure explicit app origins for CORS, for example (replace the production origin):

```json
[
  {
    "AllowedOrigins": ["https://your-site.example", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-MD5", "If-None-Match", "Range", "Cache-Control"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

The application returns all required upload headers: the browser must send them exactly. `Content-Length` is signed only when `sizeBytes` was supplied; the browser sets that header automatically from the File/Blob (do not try to set it manually). Current clients may omit size/checksum; finalize always verifies actual nonzero size and the full-object single-PUT MD5 ETag. Sending both fields additionally enforces integrity/size during PUT. Presigned POST/multipart uploads are not provided.

## REST contracts

Every route requires `Authorization: Bearer <Supabase access token>` and an active profile. Auth is verified by `getUser`, and ordinary reads use the caller-bound RLS client. All successes/errors carry `private, no-store`, `Vary: Authorization` and a no-referrer policy; responses never expose raw SQL/provider diagnostics. JSON is limited to 32 KiB. `lib/auth.ts#authedFetch` refreshes nearly expired sessions and only attaches tokens to same-origin `/api/` paths, with redirects disabled.

| Route | Contract |
|---|---|
| `GET /api/tracks?offset=0&limit=200` | `{tracks,nextOffset}`; max limit 500, authorized metadata and five-minute artwork GETs. Audio URLs are issued separately. |
| `POST /api/tracks` | Admin. `{title,artist?,album?,movie?,year?,tags?,mimeType,sizeBytes?,checksumMd5?}` → 201 `{track,key,uploadId,expiresAt,upload:{url,method,headers}}`. The pending track's `audio_key` stays null until verified. |
| `PATCH /api/tracks/:id` | Admin metadata/duration edit; known fields only, finite duration `0 < seconds <= 86400`. Returns `{track}`. |
| `DELETE /api/tracks/:id` | Admin. Removes metadata/access transactionally and enqueues durable storage deletion; `{ok:true}`. |
| `POST /api/tracks/:id/upload-url` | Admin. `{kind:'audio'|'artwork',mimeType,sizeBytes?,checksumMd5?}` → fresh immutable target and `uploadId`. Ready audio cannot be replaced. Existing artwork remains live. |
| `POST /api/tracks/:id/finalize` | Admin. `{kind?,uploadId?,durationSeconds?}`. Explicit `uploadId` is preferred; omitted ID uses the latest intent of that kind for compatibility. Checks server-held key/expiry, HEAD size/MIME/MD5 and conditional GET `Range: bytes=0-4095` (shorter for small objects) with matching ETag and magic bytes, then publishes transactionally; `{track}`. |
| `GET /api/tracks/:id/stream` | RLS-authorized ready track only → `{url,expiresAt,mimeType}`; five-minute GET authorization. |
| `GET/POST/DELETE /api/permissions` | Admin list, grant `{trackId,userId}`, revoke `?trackId=...&userId=...`. Target must be active. A revoke creates an explicit deny that wins over playlist-derived grants; a new explicit grant clears it. Admin access remains administrative. |
| `GET/POST/DELETE /api/invitations` | Admin list, create `{email,expiresInDays?:1..30}`, revoke `?id=...`; creation also reports `delivery`. |
| `GET/POST /api/chat` | Active-profile global chat, persisted/identity-bound. POST `{type:'message',text}` (1–500 chars); `{type:'ping'}` returns an authenticated acknowledgment. User-provided identities/history are ignored. No invented listener count (`listeners:null`). |
| `POST /api/storage/cleanup` | Admin; processes up to 100 eligible durable object-deletion records → `{deleted,failed}`. Failed deletions remain queued. |

**Uploads:** 200 MiB audio / 10 MiB artwork, allowlisted MIME types, no SVG/HTML, UUID-based random object keys without user filenames, 15-minute write-once PUT capability. HEAD must match declared type and optional exact size/MD5. Range validation is small-header screening, not a full decoder, codec/duration verifier, transcoder or malware scan. File content duplicates are enforced by the DB unique checksum/size constraint even with different titles and concurrent finalizations. MD5 is the R2 single-PUT integrity/dedup checksum, not a cryptographic content-authenticity claim. Multipart ETags are rejected. Legacy tracks with null checksums are not backfilled or reverified automatically.

Finalizing artwork uses a row lock and compares its originally observed pointer. If another replacement won, `STALE_UPLOAD` leaves the new live artwork intact. Failed/missing/oversized/type-mismatched uploads never mark a track ready or change artwork. Intent retries use new keys; finalized-intent retries are idempotent. GC is delayed beyond outstanding PUT/GET lifetimes and never selects referenced/live-intent objects. Invoke the cleanup endpoint periodically from an authenticated admin automation/session; no scheduler/cloud resource was created here. A denied oversized upload can still occupy R2 temporarily until GC, especially when the client omitted exact size.

### Normalized playlists

All playlists use the existing `playlists` and `playlist_tracks` tables. Returned playlist objects include canonical `name`, compatibility `title`, `revision`, ordered `playlist_tracks` and `playlist_permissions`. RLS filters inaccessible tracks from a shared playlist; a playlist UUID/link alone grants nothing.

| Route | Body / behavior |
|---|---|
| `GET /api/playlists?offset=0&limit=100` | `{playlists,nextOffset}`; max 100 per page. |
| `POST /api/playlists` | `{name|title,description?,trackIds?}` → 201 `{playlist}`; optional initial track list is validated and stored atomically. |
| `GET /api/playlists/:id` | Authorized `{playlist}`. |
| `PATCH /api/playlists/:id` | Owner only `{name|title?,description?,trackIds?,expectedRevision?}`. A supplied full track list is replaced/reordered in one transaction. |
| `DELETE /api/playlists/:id` | Owner only; tracks remain in the library. |
| `POST /api/playlists/:id/tracks` | Owner only `{trackId,expectedRevision?}`; append, no duplicate membership. |
| `DELETE /api/playlists/:id/tracks?trackId=...` | Owner only remove; positions normalized. |
| `PATCH /api/playlists/:id/tracks` | Owner only `{trackIds:[...],expectedRevision?}`; exact permutation of all current track IDs. |
| `POST /api/playlists/:id/share` | Owner only `{userId,grantTracks?:boolean,expectedRevision?}`. Only an admin owner may set `grantTracks:true`; ordinary members cannot redistribute playback rights. |
| `DELETE /api/playlists/:id/share?userId=...` | Owner only revoke that playlist membership and its derived playback rights. Independent explicit grants/other playlists remain effective unless an explicit track deny exists. |

The current UI also has collection aliases: `PATCH /api/playlists` with `{id,action?:'update'|'add'|'remove'|'reorder'|'share'|'unshare',...payload}` and `DELETE /api/playlists` with `{id}`. Playlist writes lock the parent row, validate every track, bound playlists at 500 entries, normalize positions, and bump revision atomically. `expectedRevision` is optional for current UI compatibility and recommended for stale-edit prevention.

## Persisted rate limits

`private.rate_limits` stores one locked counter per authenticated user/bucket. The API calls `consume_rate_limit` as a separate transaction **before** work, so validation/provider failures still consume API quota. Concurrent lambdas cannot lose increments (`INSERT ... ON CONFLICT DO UPDATE`). Per-minute API quotas: read 180, write 60, upload 30, stream 120, invitation 10, chat 30; HTTP 429 includes `Retry-After:60`. SQL Jam/playlist/grant/invitation/chat RPCs independently limit successful mutations. Jam join guesses return null so their limiter commits even when the room lookup fails. SQL exceptions roll back their transaction, so denied direct mutation attempts do not increment that RPC's counter. Tables are private and clients cannot reset counters or choose larger limits. Auth's OTP endpoint remains governed by Supabase Auth's configured rate limits.

## Local verification and honest boundaries

- Isolated owned-scope TypeScript check passed: `node node_modules/typescript/bin/tsc -p tests/server/tsconfig.json --incremental false`.
- Server Vitest suite: 20 tests cover provider-verified server/browser identity, foreign-URL/redirect token protection, inactive profiles, admin denial before side effects, limiter failure/exhaustion, safe errors/no-store, malformed/bounded requests, immutable signed upload inputs, conditional bounded Range reads, spoofed type/magic and checksum/size failures.
- Offline actual AWS SDK signing passed: `node --test tests/server/presign.test.mjs`; no network or real credentials.
- PostgreSQL/PGlite integration passed all three real migrations and 18 security scenarios (19 tests including the parent): invitation activation/legacy admin-bit stripping, RLS/ACL bypass denial, both-user track checks, outsider leave denial, receipts/revisions, unforgeable readiness, host queues/guest suggestions/reorder, authenticated chat, restrictive Realtime policy behavior, playlist atomicity/derived revocation, artwork pointer concurrency, duplicate checksums, limiter counters and GC exclusions. PGlite serializes submitted queries; this validates real SQL behavior and queued concurrent calls, not multi-connection database stress.

Commands from the site root:

```sh
node node_modules/typescript/bin/tsc -p tests/server/tsconfig.json --incremental false
node node_modules/vitest/vitest.mjs run --config tests/server/vitest.config.ts
node --test tests/server/presign.test.mjs
PGLITE_ROOT=/tmp/omnirush/adhurekisse-server/node_modules/@electric-sql/pglite node --test tests/server/database.test.mjs
```

For the SQL runner install `@electric-sql/pglite` into a disposable location (or supply it in the test environment); it is not added to application dependencies. The existing WSL dependencies lacked Linux Rollup/esbuild binaries, so local Vitest used `NODE_PATH=/tmp/omnirush/node_modules` and `ESBUILD_BINARY_PATH=/tmp/omnirush/node_modules/@esbuild/linux-x64/bin/esbuild`. Whole-site typecheck initially found errors in concurrently edited login/UI/Jam files; isolated server checks are the owned-scope result. No production build that loads `.env.local`, hosted migration, real OTP/email invite, R2 upload/CORS round-trip, live Realtime handshake/managed-table ownership check, multi-device sync, or production mutation is claimed. PGlite uses minimal Auth/Realtime schema fixtures; it executes the RLS/functions but does not reproduce those hosted services.
