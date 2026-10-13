# Adhure Kisse operations runbook

Registration update **2026-10-14** (original operations review 2026-10-03). Application root: **`sites/adhurekisse`**. [Architecture/decision timeline](ADHUREKISSE-ARCHITECTURE.md) · [security/threat model](ADHUREKISSE-SECURITY.md) · [Android matrix](ANDROID-TEST-MATRIX.md).

All provider setup, migration and hosted acceptance steps below are **operator procedures, not completed cloud work**. Commands use an isolated test stack first. Do not load, print or copy this checkout's `.env.local`, live keys, user music or existing browser sessions into tests.

## 1. Verify deployment identity before configuration

Use the user's existing URL **`https://only-for-you-olive.vercel.app`**. A read-only fetch on 2026-10-03 rendered **OnlyForYou**, “Every song here was chosen for you,” and a 68-song archive. The URL name alone cannot establish its source root.

In the existing Vercel project's dashboard, verify:

1. **Root Directory: `sites/adhurekisse`**, specifically compare against `sites/onlyforyou`.
2. Repository, deployed Git revision, production branch, alias/domain and build logs identify this site's package/app.
3. Framework Next.js; install `npm ci`; build `npm run build`; standard Next `.next` output; no static-export override for server APIs.
4. Environment scopes match the intended project: previews/test use their own Supabase/R2 resources; no live credentials in PR CI.
5. `/login`, `/library`, `/admin`, manifest and visible Adhure Kisse branding belong to that revision. Main must reconcile hardcoded metadata/site origins with the verified existing URL.

If the existing URL is intentionally still mapped to OnlyForYou, record that fact and resolve the root/alias decision with the owner before acceptance. No new production URL or successful deployment is claimed here. See [Vercel monorepos](https://vercel.com/docs/monorepos).

## 2. Environment contract

Use [`sites/adhurekisse/.env.example`](../sites/adhurekisse/.env.example) as a **placeholder reference**. Set actual values in the target provider's environment store. In an isolated local checkout only, create an ignored local env file through your normal secret manager/editor. Never source the live checkout's file as a test shortcut.

| Variable | Required for | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth, metadata and Jam | Public client + server, correct project at **build time** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase client/API contract | Public publishable/anon API key; RLS still required |
| `SUPABASE_SERVICE_ROLE_KEY` | Checked Auth invitations, upload publication, GC | **Server only**, separate from caller-bound read client |
| `R2_ACCOUNT_ID` | S3 endpoint | Server only |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Signing/storage verification/deletion | Server only, one-bucket Object Read & Write credential |
| `R2_BUCKET_NAME` | Private audio and artwork | Server only; isolated test bucket must be different |
| `NEXT_PUBLIC_SPOTIFY_CLIENT_ID`, `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` | Optional existing Spotify PKCE | Public; Spotify `/callback` is separate from Supabase `/login` |

Next loads `.env*` automatically, including `.env.local` during a production build. `NEXT_PUBLIC_*` values are inlined at build time, so changing them requires a new build. A variable prefix is not a substitute for server-only imports. CI builds use only obvious `.invalid`/placeholder settings on a fresh checkout; they do not establish working cloud connectivity. Private API authentication fails closed when Supabase is missing even if the curated archive can still render.

## 3. Supabase setup and forward migration

### Auth settings, before opening the app

- Apply migration 0004 before deploying the registration UI or enabling **Allow new users to sign up**. Enable the email/password provider and public signup only after the migration succeeds. Keep anonymous sign-ins disabled and email confirmation enabled. New confirmed users may listen solo and use the code-based Jam flow; no invitation or Jam code is required for registration.
- Configure Site URL for the verified app origin and explicit redirect destinations ending in `/login`. Add exact test/localhost destinations only to the isolated test project. Supabase invitation/magic-link redirects must **not** target Spotify `/callback`.
- For six-digit code login, include **`{{ .Token }}`** in the Magic Link/OTP template. Supabase otherwise sends a magic link by default. Client OTP requests use `shouldCreateUser:false`; confirmed account activation calls `activate_account()` after provider session verification.
- Configure custom SMTP for real listeners, including the Confirm Signup template's confirmation link and the Magic Link template. Supabase's default SMTP sends only to authorized project-team addresses, currently limits to **2 emails/hour**, and offers no delivery SLA. A signup response or database invitation is not evidence of mail delivery. Duplicate signup responses intentionally do not disclose account existence.
- Keep JWT expiry reasonably short for the private audience and verify refresh/rejoin behavior. Realtime authorization can retain old channel access until a new JWT or expiration; do not confuse access-token lifetime with refresh-session lifetime.

### Migration order and operator provisioning

Take an encrypted, restorable database backup and record the existing migration state/owner UUID. Use a separate test project/bucket first. For a fresh target apply, in order:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_chat_messages.sql`
3. `supabase/migrations/0003_private_library_hardening.sql`
4. `supabase/migrations/0004_public_registration.sql`

For an existing target that already has 0001/0002/0003, apply **only 0004**. These files are forward migrations, not an idempotent “run every file again” recipe. 0003 and 0004 run in one transaction; inspect a failed transaction before retry. Do not edit historical migrations or manually recreate the old first-user bootstrap.

Example for a **fresh isolated test database**, from the site root with a test connection injected into the shell:

```sh
set -euo pipefail
test "$TEST_TARGET_CONFIRMED" = "adhurekisse-isolated-test"
test -n "$TEST_DATABASE_URL"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0001_init.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0002_chat_messages.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_private_library_hardening.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0004_public_registration.sql
```

Replace a connection only after independently confirming the target project. Provider SQL Editor may instead run each complete file in this order. Verify `pgcrypto`/`citext` placement and provider-managed Auth/Realtime schemas on the actual target. PGlite fixtures do not prove the hosted schema/extension/ownership configuration.

**All existing profiles become inactive after 0003. There is no first-user administrator.** Create/provision the intended owner's confirmed Auth account through the trusted provider dashboard/admin path, then independently verify its **Auth UUID**, email and identity. Activate only that UUID. This trusted SQL also handles a pre-0001 account with no profile:

```sql
begin;
select pg_advisory_xact_lock(9182026,1);
do $owner$
declare
  owner_id uuid := '<VERIFIED_OWNER_AUTH_UUID>'::uuid;
begin
  if not exists (
    select 1 from auth.users
    where id = owner_id and email is not null and email_confirmed_at is not null
  ) then
    raise exception 'Verified confirmed owner Auth account is required';
  end if;
  insert into public.profiles (id, email, display_name, is_admin, is_active)
    select id, email, 'Owner', true, true from auth.users where id = owner_id
  on conflict (id) do update
    set is_admin = true, is_active = true, invitation_id = null;
end $owner$;
select id, is_admin, is_active from public.profiles
where id = '<VERIFIED_OWNER_AUTH_UUID>'::uuid;
commit;
```

Replace both UUID placeholders with the independently verified same UUID; confirm exactly one intended active admin row. Never promote by email alone, creation order or “all legacy profiles.” An old admin bit remains ineffective while inactive. Pre-0001 ordinary Auth accounts missing a profile require trusted explicit profile provisioning, not automatic scanning/activation of all accounts.

### 0004 rollout and existing accounts

- Active accounts and active administrators keep their access. New Auth accounts
  get an inactive, non-admin profile explicitly eligible for one-time activation.
  `activate_account()` requires a confirmed email and a non-anonymous, unbanned
  Auth identity. Repeated calls preserve existing active roles.
- Existing **inactive** profiles stay locked, including previously pending
  invitations. This avoids silently restoring revoked users or activating an old
  first-user admin bit. After verifying one ordinary account's UUID, opt it in
  using trusted SQL (never run for all profiles):

  ```sql
  begin;
  select pg_advisory_xact_lock(9182026,1);
  update public.profiles
    set activation_eligible=true, activation_provenance='operator_verified'
    where id='<VERIFIED_LISTENER_AUTH_UUID>'::uuid and not is_active;
  commit;
  ```

  Its next confirmed login activates it **without admin privileges**. A fresh
  invitation alone does not unlock a disabled or legacy-locked account.
- Any explicit `is_active=false` update clears activation eligibility, including
  disabling a pending account. Revoking an accepted invitation still deactivates
  the linked ordinary user; neither activation RPC can undo that. Operators must
  take the same advisory lock before changing access by direct SQL.
- Verify real signup mail, confirmation, password/OTP login, an existing owner,
  a disabled user, and a signed-out `/?jam=CODE` link on the isolated provider
  stack. Then deploy this site's code and repeat the approved live smoke checks.
  No hosted migration, Auth toggle, mail delivery or deployment is claimed by the
  local test results below.

### Realtime and schema acceptance

- Disable **Allow public access** in Supabase Realtime settings. Client channels use `config.private:true` and refreshed JWTs; no public fallback.
- 0003 creates policies on provider-owned `realtime.messages`; **do not add `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY`**. Official docs say the table already has RLS and such ALTER can abort on ownership checks.
- Verify publication tables with:

```sql
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime' order by schemaname, tablename;
select relrowsecurity from pg_class
where oid = 'realtime.messages'::regclass;
```

Expected app tables: `jam_rooms`, `jam_room_state`, `jam_participants`, `jam_messages`, `jam_events`, and global `messages`. **`jam_queue` and `tracks` must not be published**. Queue changes bump state revision/events and trigger an RLS-authorized refetch. Supabase cannot enforce deleted-row membership checks on raw DELETE events.

Check allow/deny as anon, inactive, invited ungranted, granted, admin and non-member using their own JWTs. Do not use a service-role client as proof of RLS. Inspect table/function grants as well as policies. Do not expose the `private` schema in the Data API.

## 4. Private R2 setup and exact CORS

Keep **public access disabled**: both `r2.dev` and public bucket custom domains. Scope the R2 API credential to **Object Read & Write on this one bucket**. Keep audio/artwork out of `public/` and Git.

**R2 S3 presigns work only on the S3 API domain** (`<account>.r2.cloudflarestorage.com`, using the SDK's selected path/host style). They cannot be moved to a custom domain by replacing the hostname. Attaching a public custom domain for “private CDN delivery” would create unsigned access outside this model. A separate authenticated Worker/proxy design would need its own architecture; none was configured.

After verifying the existing Vercel root/alias, the production bucket dashboard CORS JSON should name that exact origin:

```json
[
  {
    "AllowedOrigins": ["https://only-for-you-olive.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-MD5", "If-None-Match", "Range", "Cache-Control"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

For a **different test bucket**, use `http://localhost:3000` and/or the exact isolated test deployment origin. Origins contain scheme/host/optional port, **no path or trailing slash**. Add a deliberate exact preview origin only to the test bucket, then remove it when retired. Do not use `*` or `https://*.vercel.app`: a wildcard authorizes unrelated tenants' browser origins. CORS controls browser cross-origin reads/PUTs, not who can use a leaked capability in other clients.

Current PUT contract returns `Content-Type`, `If-None-Match:*`, `Cache-Control:private,no-store`, and optional `Content-MD5`. Send returned headers exactly; never add Supabase Authorization. Browser-supplied Content-Length follows the actual File/Blob; do not set this forbidden browser header manually. Signature binds length when supplied. SDK automatic CRC headers are disabled by current server configuration; if main changes signing, inspect actual preflight headers and revise narrowly rather than allow all headers.

Verify in a real browser: allowed-origin preflight succeeds; unrelated origin is denied; upload with exact headers succeeds; modified MIME/checksum fails; second PUT to the same key fails; Range GET/seek returns expected bytes; unsigned access fails. A GET presign is not a HEAD presign—use the right method when diagnosing. Native media currently may use no-CORS requests, while upload/JS fetch requires CORS. R2 may omit CORS headers on expired-presign errors, so a browser CORS-looking error can actually be expiry; reacquire an authorized URL before weakening policy.

## 5. Library, invitations, revocation and cleanup

- Admin upload: edit metadata before start; audio ≤200 MiB, artwork JPEG/PNG/WebP/AVIF ≤10 MiB; verified ready audio cannot be replaced. A cancelled/failed browser job retains its pending row. Retry uses a new intent or retries finalize after bytes landed; dismissing a queue item is not a storage deletion.
- Finalize checks server-held intent/expiry, HEAD size/MIME/MD5 and ETag-bound ≤4 KiB magic bytes before publication. Duration supplied by browser is not full decode validation. Duplicate ready checksummed **content** is rejected even under another title; legacy null-checksum tracks are not backfilled.
- Invitation POST reports `delivery:sent|existing_account|pending`. `pending` requires mail/Auth provisioning investigation; it does not mean email sent. Eligible new registrations activate after confirmation without an invitation; a pending valid invitation may be linked during activation as an audit/revocation record. Already active accounts are not retroactively linked. Neither registration nor invitations grant tracks. The DB/mail operation cannot be atomic across services.
- Grant exact tracks after activation. Playlist sharing alone only shares its metadata/authorized entries; admin-owner `grantTracks:true` supplies derived rights. Track revoke installs a deny even if a playlist would otherwise grant; explicit regrant clears it. Unshare removes that playlist's derived rights, not independent grants.
- Revoking an accepted invitation deactivates the ordinary account bound to that invitation. It does not delete an Auth account or already downloaded media. Operator admins are deactivated through the trusted UUID path.
- Track DELETE removes DB metadata/grants transactionally and queues R2 deletion. Invoke **`POST /api/storage/cleanup`** with a verified active admin bearer session periodically; it processes ≤100 eligible keys, keeps failures queued and excludes referenced/live-intent objects. Normal delayed deletion is ≥20 minutes; expired intents have a five-minute grace beyond PUT expiry. Repeat until eligible backlog drains.
- `jam_expire_rooms()` is service-role/operator-only after 0003; expiry checks already deny access after the 12-hour window. An operator may schedule it to finalize terminal state. No cron, job or cloud scheduler was created by this work.

## 6. Linux CI and local checks

Run from the site root on a fresh Linux install, **in an isolated checkout without live env files**:

```sh
npm ci
npm audit --audit-level=high
npm run typecheck -- --incremental false
npm run lint
npm test
npm exec -- vitest run --config tests/server/vitest.config.ts
node --test tests/server/presign.test.mjs
npm run build
npm exec -- playwright install --with-deps chromium
QA_STAGE_PARENT=/tmp QA_OUTPUT_DIR=/tmp/adhurekisse-local-results QA_REPORT=/tmp/adhurekisse-local-report.json npm run test:e2e:local
```

The CI workflow runs audit independently and a non-fail-fast typecheck/lint/test/build matrix on Ubuntu 24.04/Node 22. Tests include server Vitest and offline actual AWS signing. A separate PGlite 0.5.8 job applies all four migrations with minimal Auth/Realtime fixtures; this is real SQL/RLS coverage, not the hosted Auth/mail/Realtime service. Install dependencies on the OS running the checks rather than reusing native binaries from another platform. The QA harness is `tests/playback/playwright.config.ts` / `serve-next.mjs`; CI sets `QA_STAGE_PARENT`, `QA_OUTPUT_DIR` and `QA_REPORT` under `runner.temp`, since the harness's `/tmp/omnirush` defaults do not exist on GitHub runners. It stages allowlisted current app source without copying env files. Mock Realtime/API traffic and synthesized Range-served WAV verify app integration, not provider configuration.

**QA integration contract:** `test:e2e:local` starts/manages a loopback app/test harness with deterministic fake provider endpoints, generated lawful media, no live credentials and substantive browser assertions. The 2026-10-14 Windows Chromium verification covers **50 passing scenarios**, including four axe audits and registration at 320px/390px. The expanded full run passed 49; one redirect assertion hit its 15-second limit while Next compiled the destination. It now uses a bounded navigation-specific 60-second limit; all four affected destination tests passed on recheck. It used an isolated Next server with `QA_NEXT_TURBO=1` (avoids Windows directory-symlink permissions), temp stage/output/report paths, fake services and real WAV fixtures. Browser artifacts with tokens/signed URLs are not automatically uploaded.

The additional component suite (`npm exec -- playwright test --config tests/frontend/playwright.config.ts`) passed **20/20**, on desktop and mobile. An initial cold Vite navigation timed out; the complete rerun passed without changing app behavior or test assertions. Its cache/output paths now use the OS temp directory rather than a hard-coded POSIX path.

The same registration change passed typecheck (`npm run typecheck -- --incremental false`), lint (`ESLINT_USE_FLAT_CONFIG=false` plus `node node_modules/eslint/bin/eslint.js .` on PowerShell), **85 unit**, **40 server**, **1 AWS presign**, **28 PGlite tests** (27 subtests plus parent), and `npm run build` in the isolated no-live-env staged app. SQL tests include upgrade/legacy safety, email confirmation, public signup without an invitation, no admin escalation, and denied reactivation after revocation/disable.

The package-script mapping is `"test:e2e:local": "playwright test --config tests/playback/playwright.config.ts"`; it is wired and has been run locally against the isolated Next harness.

Current snapshot blockers: hosted Supabase/Auth/SMTP/R2/CORS/Realtime acceptance, production deployment identity, and physical Android/device matrix results remain unverified. `npm audit --audit-level=high` remains non-zero with **11 findings (8 high, 3 moderate)** in Tailwind/Next parser and nested PostCSS chains; automatic remediation requires major Next/Tailwind upgrades and was not applied blindly. Do not make the audit advisory or run `npm audit fix --force` without reviewing those migrations.

## 7. Safe generated fixtures (offline)

The following generator is an exact documentation recipe, not a pre-existing package script. Run in an isolated test checkout's site root. It writes **only synthesized, low-amplitude PCM test tones and a geometric PNG**, no songs, speech, downloads or copyrighted artwork. `.test-fixtures/` is ignored. The 600-second marker tone is about 53 MB, below the audio limit; use it for expiry/long-play checks, the 30-second tone for queue transitions and the five-second tone as an ungranted access-denial fixture. Keep device volume low.

```sh
python3 - <<'PY'
import math, pathlib, struct, wave, zlib
out = pathlib.Path('.test-fixtures')
out.mkdir(exist_ok=True)
rate = 44100
for name, hz, seconds in [('tone-440-long.wav', 440, 600), ('tone-660-short.wav', 660, 30), ('tone-880-restricted.wav', 880, 5)]:
    with wave.open(str(out / name), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate)
        block = bytearray()
        for i in range(rate):
            t = i / rate
            envelope = max(0, math.sin(math.pi * t / 0.1)) if t < 0.1 else 0
            block += struct.pack('<h', round(32767 * 0.08 * envelope * math.sin(2 * math.pi * hz * t)))
        for _ in range(seconds):
            wav.writeframesraw(block)
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
rows = b''.join(b'\x00' + bytes((80, 60, 120)) * 64 for _ in range(64))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', 64, 64, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
(out / 'test-cover.png').write_bytes(png)
print('Generated test-only tones and cover; no provider access.')
PY
```

These tones verify WAV, transport, queue/seek and timing; they do not prove every codec. Additional MP3/AAC/Opus/FLAC fixtures should be encoded from these synthesized samples with locally installed tooling and logged encoder/version, not copied from the curated archive. Mock upload buffers in frontend tests are request fixtures, not decoder/CORS evidence.

## 8. Isolated hosted acceptance: exact TEST environment

**Unverified, operator-run.** Use a separate Supabase project, R2 bucket ending `-test`, Auth accounts and app deployment, with all three migrations and explicit test-owner UUID provisioning. In the test UI invite and activate the guest before seeding. A third active but ungranted test listener supports access-denial cases. Verify the test app is built/configured with that project's public variables and test server credentials. Test env never belongs in the live Vercel environment or live `.env.local`.

Inject these variables into a **separate test shell** from a test secret store; examples are deliberately unusable placeholders:

```sh
export TEST_TARGET_CONFIRMED="adhurekisse-isolated-test"
export TEST_APP_ORIGIN="https://REPLACE-ISOLATED-TEST-DEPLOYMENT.invalid"
export TEST_SUPABASE_PROJECT_REF="REPLACE_TEST_PROJECT_REF"
export TEST_SUPABASE_URL="https://REPLACE_TEST_PROJECT_REF.supabase.co"
export TEST_SUPABASE_ANON_KEY="REPLACE_TEST_PUBLIC_ANON_KEY"
export TEST_R2_BUCKET_NAME="adhurekisse-acceptance-test"
export TEST_HOST_EMAIL="test-owner@example.invalid"
export TEST_HOST_PASSWORD="REPLACE_TEST_OWNER_PASSWORD"
export TEST_GUEST_EMAIL="test-guest@example.invalid"
export TEST_GUEST_PASSWORD="REPLACE_TEST_GUEST_PASSWORD"
export TEST_THIRD_EMAIL="test-outsider@example.invalid"
export TEST_THIRD_PASSWORD="REPLACE_TEST_OUTSIDER_PASSWORD"
export TEST_TRACK_TITLE="TEST Tone 440Hz 600s"
export TEST_SECOND_TRACK_TITLE="TEST Tone 660Hz 30s"
```

`TEST_DATABASE_URL` is used only by the test migration operator. The acceptance client needs no service-role/R2 credential: it uses the app's verified owner API, and the app uses its own test credentials. Replace placeholder email/password/public values through the secret store. Do not put a secret literal in terminal history, invoke shell tracing, or print sign-in/provider response bodies.

### Guarded seed and hosted-suite launcher

This exact Node recipe runs **once per disposable fixture set** from the site root after offline tone generation. Missing/placeholder configuration or the known live app URL causes failure **before network access**. It uploads through the real create/PUT/finalize APIs, grants two generated tones to the test guest, leaves a third restricted to the owner, prints only a success summary and launches `test:e2e` with a TEST-to-E2E mapping. It requires three distinct active test accounts and provides all current hosted-suite inputs so missing negative fixtures cannot silently skip. No test credential is written to application env files. Duplicate content yields an explicit failure; remove prior test tracks through the test UI/GC before rerunning. No live cleanup is automatic.

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const names = ['TEST_TARGET_CONFIRMED', 'TEST_APP_ORIGIN', 'TEST_SUPABASE_PROJECT_REF',
  'TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', 'TEST_R2_BUCKET_NAME', 'TEST_HOST_EMAIL',
  'TEST_HOST_PASSWORD', 'TEST_GUEST_EMAIL', 'TEST_GUEST_PASSWORD', 'TEST_THIRD_EMAIL',
  'TEST_THIRD_PASSWORD', 'TEST_TRACK_TITLE', 'TEST_SECOND_TRACK_TITLE'];
for (const name of names) {
  if (!env[name] || /REPLACE_|placeholder/i.test(env[name])) throw new Error(`Missing test value: ${name}`);
}
const app = new URL(env.TEST_APP_ORIGIN);
const sb = new URL(env.TEST_SUPABASE_URL);
if (env.TEST_TARGET_CONFIRMED !== 'adhurekisse-isolated-test' || app.protocol !== 'https:' ||
    app.origin !== env.TEST_APP_ORIGIN || app.hostname.endsWith('.invalid') || app.username || app.password ||
    app.hostname === 'only-for-you-olive.vercel.app' ||
    sb.origin !== env.TEST_SUPABASE_URL || sb.protocol !== 'https:' || sb.username || sb.password ||
    sb.hostname !== `${env.TEST_SUPABASE_PROJECT_REF}.supabase.co` ||
    !env.TEST_R2_BUCKET_NAME.endsWith('-test')) throw new Error('Isolated TEST targets required');

async function signIn(prefix) {
  const client = createClient(sb.origin, env.TEST_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: env[`TEST_${prefix}_EMAIL`], password: env[`TEST_${prefix}_PASSWORD`] });
  if (error || !data.session || !data.user) throw new Error(`Test ${prefix} sign-in failed`);
  const { data: active, error: activationError } = await client.rpc('accept_invitation');
  if (activationError || active !== true) throw new Error(`Test ${prefix} is not active/invited`);
  return { id: data.user.id, token: data.session.access_token };
}
const host = await signIn('HOST');
const guest = await signIn('GUEST');
const third = await signIn('THIRD');
if (new Set([host.id, guest.id, third.id]).size !== 3) throw new Error('Distinct test participants required');
async function api(path, method = 'GET', body) {
  const res = await fetch(`${app.origin}${path}`, { method, redirect: 'error',
    headers: { Authorization: `Bearer ${host.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`Test API ${method} ${path} failed (${res.status})`);
  return res.json();
}
// Confirms admin authorization before uploading any bytes.
await api('/api/invitations');
let restrictedTrackId;
for (const [file, title, seconds, shared] of [
  ['tone-440-long.wav', env.TEST_TRACK_TITLE, 600, true],
  ['tone-660-short.wav', env.TEST_SECOND_TRACK_TITLE, 30, true],
  ['tone-880-restricted.wav', 'TEST Restricted Tone 880Hz 5s', 5, false],
]) {
  const bytes = await readFile(`.test-fixtures/${file}`);
  const reservation = await api('/api/tracks', 'POST', { title, artist: 'Generated test fixture',
    mimeType: 'audio/wav', sizeBytes: bytes.length,
    checksumMd5: createHash('md5').update(bytes).digest('hex') });
  const target = new URL(reservation.upload.url);
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.r2.cloudflarestorage.com') ||
      target.username || target.password || reservation.upload.method !== 'PUT') throw new Error('Unexpected test upload target');
  const put = await fetch(target, { method: 'PUT', headers: reservation.upload.headers,
    body: bytes, redirect: 'error' });
  if (!put.ok) throw new Error(`Test R2 PUT failed (${put.status})`);
  await api(`/api/tracks/${reservation.track.id}/finalize`, 'POST', {
    kind: 'audio', uploadId: reservation.uploadId, durationSeconds: seconds });
  if (shared) await api('/api/permissions', 'POST', { trackId: reservation.track.id, userId: guest.id });
  else restrictedTrackId = reservation.track.id;
}
console.log('Generated fixtures ready: two shared tones and one owner-only negative fixture.');
const child = spawnSync('npm', ['run', 'test:e2e'], { stdio: 'inherit', env: { ...env,
  E2E_BASE_URL: app.origin, E2E_SUPABASE_URL: sb.origin,
  E2E_SUPABASE_ANON_KEY: env.TEST_SUPABASE_ANON_KEY,
  E2E_HOST_EMAIL: env.TEST_HOST_EMAIL, E2E_HOST_PASSWORD: env.TEST_HOST_PASSWORD,
  E2E_GUEST_EMAIL: env.TEST_GUEST_EMAIL, E2E_GUEST_PASSWORD: env.TEST_GUEST_PASSWORD,
  E2E_THIRD_EMAIL: env.TEST_THIRD_EMAIL, E2E_THIRD_PASSWORD: env.TEST_THIRD_PASSWORD,
  E2E_TEST_TRACK_TITLE: env.TEST_TRACK_TITLE, E2E_SECOND_TRACK_TITLE: env.TEST_SECOND_TRACK_TITLE,
  E2E_RESTRICTED_TRACK_ID: restrictedTrackId, E2E_OUTPUT_DIR: '.test-fixtures/hosted-results' } });
if (child.error) throw new Error('Could not start test runner');
process.exit(child.status ?? 1);
NODE
```

This Node PUT does **not** test browser CORS; repeat upload/artwork in the real test browser with the generated files. The newly updated hosted suite uses real `/login` password interaction and no persisted global-setup sessions. QA still owns final contract/assertion review, including generic full-room unavailability matching server privacy semantics. Script completion or skipped specs must not be reported as hosted acceptance. Traces/screenshots/Auth storage states may contain test tokens and signed URLs; keep them private, ignored, short-lived and delete them after triage.

### Hosted acceptance checklist (all unverified)

| Check | Required evidence | Status |
|---|---|---|
| Deployment/root and test isolation | Correct app/revision, exact origin, test project/bucket; live URL rejected by guard | UNVERIFIED |
| Fresh + legacy migration | 0001/0002/0003 on fresh test; seeded legacy profiles inactive; only verified UUID admin | UNVERIFIED |
| Auth/SMTP/OTP | Confirmed invited email activates; uninvited/expired/revoked denied; real test email receipt and cooldown | UNVERIFIED |
| API/RLS negatives | Anonymous/inactive/ungranted cannot list/stream/upload/admin/outsider RPC; valid grant succeeds | UNVERIFIED |
| Upload/artwork/CORS | Browser exact-origin preflight, conditional PUT replay/type/size/checksum denial, successful finalize, stale artwork protection | UNVERIFIED |
| Streams/seek/expiry | Native Range seeking and seek after >5 minutes reacquire URL at same position; revocation blocks new presigns | UNVERIFIED |
| Playlist isolation | Metadata link alone no grant; admin-derived rights work; explicit revoke wins; unshare preserves independent grant | UNVERIFIED |
| Two-person Jam | Both-device rights/readiness, scheduled start, host-only vs collaborative controls, idempotency/revision/atomic queue | UNVERIFIED |
| Realtime | Public/outsider join denied; no forged publication; refresh/revocation cache bounded; reconnect refetch; no raw DELETE feed | UNVERIFIED |
| Cleanup/rate limits | 429/Retry-After, committed invalid join guesses; GC excludes live objects and retries failures after grace | UNVERIFIED |
| Physical Android | Complete [matrix](ANDROID-TEST-MATRIX.md) with measurements/device/build metadata | UNVERIFIED |

## 9. Free-tier capacity and operational monitoring

Official limits retrieved **2026-10-03**, not a perpetual free-service guarantee:

| Service | Published Free/standard allowance | App implication |
|---|---|---|
| Supabase projects/database | 2 active Free projects; 500 MB DB/project; pause after 1 week inactivity; no included automatic backups | Test+live can consume the two-project allowance; export/restore test DB independently; paused Auth/DB/Jam must be unpaused |
| Supabase Auth | 50,000 MAU; custom SMTP supported; default SMTP restricted/2 mails per hour | Small audience does not remove email delivery/configuration requirements |
| Supabase traffic/storage | 5 GB egress + 5 GB cached egress; 1 GB Storage | Media lives in R2, not Supabase Storage; DB/Auth/Realtime traffic and message/history growth still count |
| Supabase Realtime | 200 peak connections; 2 million messages/month; 100 messages/sec; 100 joins/sec; 100 channels/connection | Multiple tabs/reconnects/heartbeats fan out; two-person rooms are not “free unlimited sync” |
| R2 Standard | 10 GB-month, 1 million Class A operations, 10 million Class B operations monthly; direct egress free | PUT = A; HEAD/GET/Range = B; repeated seek/refresh costs operations; storage/artwork/failed intents count; Infrequent Access excluded |

Check actual organization/project usage dashboards, R2 storage/request metrics, Auth mail failures, Realtime limit/disconnect errors, API 401/403/429/5xx, GC backlog/failure counts and reconnect/readiness timeouts. No observability integration or alerts were provisioned here. Export database metadata/grants and authorized media backups to a separate protected location; Free lacks automatic backups. Persisted chat/events/receipts have no retention job in this change: choose and verify a retention policy before growth consumes DB quota.

## 10. Incident, rotation, recovery and rollback

1. Record affected credential/account/object/revision/time without secret values; revoke compromised access and stop new privileged operations as needed.
2. For leaked R2 credentials: revoke/replace the bucket token in Cloudflare, update server environment, redeploy and test unsigned/old/new requests. Do not promise old presigns remain valid after key revocation; already buffered bytes cannot be recalled.
3. For leaked Supabase service credentials: rotate/revoke using the dashboard's applicable key model, update server secret store, review Auth/DB/admin/GC activity and redeploy. Legacy JWT anon/service-role signing-key rotation can affect user tokens/public build values; coordinate key-model-specific refresh/rebuild instead of treating all keys alike.
4. For a listener compromise: revoke track grants/invitation or deactivate the exact UUID through the trusted operator path; verify new API/RPC denial and Realtime token/expiry behavior. Remove affected media urgently if capability containment requires it.
5. If a credential reached Git, rotate first and privately triage scanner findings, then arrange deliberate history remediation with the owner. `.gitignore` does not erase existing commits. No blanket scan baseline or disabling critical checks.
6. Restore only from a verified protected backup into an isolated target first. Preserve DB/R2 key consistency and recheck grants, pending intents/GC and owner identity. Do not restore objects to a public bucket.
7. 0003 intentionally disables legacy access and changes client/SQL contracts. A previous app deployment may be incompatible; do not automatically roll SQL back to permissive 0001 behavior. During an incident use a compatible app revision/maintenance response, or a tested full restoration while access is closed, then verify the security boundary again.

## References

Consulted 2026-10-03: [Next env/build](https://nextjs.org/docs/15/app/guides/environment-variables), [Next production](https://nextjs.org/docs/15/app/guides/production-checklist), [Vercel roots](https://vercel.com/docs/monorepos), [R2 presigns](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Supabase OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [private Realtime](https://supabase.com/docs/guides/realtime/authorization), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Supabase pricing](https://supabase.com/pricing).
