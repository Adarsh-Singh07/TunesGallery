# Adhure Kisse security model

Reviewed **2026-10-03**; applies to **`sites/adhurekisse`** and its 0003 forward-hardening contract. See [architecture](ADHUREKISSE-ARCHITECTURE.md), [setup/incident operations](ADHUREKISSE-OPERATIONS.md) and [unverified device acceptance](ANDROID-TEST-MATRIX.md). This is a source/configuration review, not a hosted penetration-test or cloud-setup claim.

## Assets, principals and boundaries

Protect private audio/artwork, listener emails, grants and invitations, authenticated chat, room metadata/timeline/queue, JWT/refresh tokens, R2 capabilities, server credentials and CI supply chain.

Principals: signed-out visitor; active invited listener; inactive/revoked account; verified active administrator; host; guest; non-member; trusted SQL/service operator. Admin/library ownership and Jam hosting are different privileges: a host need not be admin. Provider/project operators and a compromised service-role/R2 credential are inside the privileged trust boundary.

Untrusted inputs include filenames/metadata/media bytes, UUIDs/room codes, JSON, JWT strings before verification, client readiness/clock reports, reconnect callbacks, Presence/Broadcast identity, deep links and PR code. Browser UI hiding is not authorization. Network TLS protects transport, not a recipient redistributing downloaded audio.

## Threats, controls and remaining exposure

| Threat / abuse case | Implemented boundary | Remaining exposure / required acceptance |
|---|---|---|
| First account or stale legacy admin takes over | 0003 inactive default; trigger never auto-promotes; explicit verified UUID operator provisioning; invitation clears old admin bit | Apply migrations before opening Auth/app; verify owner affected-row result. Legacy profiles stay inactive until deliberate action |
| Forged JWT/session/profile or uninvited confirmed user | API `getUser`; active-profile check; confirmed Auth-email invitation acceptance; signup/anonymous Auth disabled by operator | Hosted Auth settings and email proof still require acceptance; local user metadata is not authorization |
| IDOR / guessing tracks, playlists, rooms or another listener's data | Caller-bound RLS reads, least-privilege grants, checked RPCs; members-only room reads; explicit track deny wins for ordinary users | Real hosted allow/deny tests needed, including direct PostgREST/RPC, not only UI |
| Invitation or Jam link redistributes music rights | Activation grants no tracks; Jam validates both listeners independently; only admin playlist owner may grant tracks | Existing GET capabilities/buffered copies remain usable within their authorization/cache window |
| Stolen R2 URL, referrer, log or analytics leak | Five-minute GET; 15-minute write-once PUT; no-store API/object response settings; no-referrer API responses; direct upload has no app JWT | Capability is bearer access in any HTTP client; CORS is not authentication or immediate revocation. Audit page-level referrers/telemetry and redact network captures |
| Private bucket accidentally published | Require `r2.dev` and public/custom-domain access off; bucket-scoped server credentials; S3-domain signatures only | A public custom domain exposes unsigned reads independently of signatures. Provider dashboard verification is mandatory for hosted acceptance |
| Signed upload replay / overwrite / publish spoofed bytes | Fresh UUID key per intent; signed MIME/optional size/MD5 and `If-None-Match:*`; verify HEAD + ETag-bound ≤4 KiB Range/magic; publish transactionally | Presigns normally reusable; conditional PUT supplies write-once behavior. Screening is not a decoder/malware scan. Omitted size can allow temporary oversized storage until GC |
| Duplicate/stale artwork finalization or lost delete | Row locks, observed artwork-pointer check, idempotent finalized intent; durable delayed GC excluding referenced/live-intent keys | Cleanup is not scheduled by this change; track removal does not prove object deletion until GC succeeds |
| Command replay or stale/concurrent queue state | Command receipt bound to actor/type/payload; required expected revision; row locks; atomic reorder/skip/select-consume; both-user access lock | Operator direct SQL changes must observe authorization/locking semantics. PGlite is not multi-connection stress evidence |
| Forged readiness, chat or participant identity | `jam_set_ready`, `jam_heartbeat`, `jam_send_message` derive identity from `auth.uid()`; durable messages; client Jam publication denied | A legitimate client can lie about its own decoder readiness; database cannot observe device audio. Display names are untrusted presentation data |
| Public topic / revoked socket receives metadata | `private:true`, member policies/restrictive guards, disable Realtime public access; row RLS separately | Channel authorization caches until new JWT/expiry/rejoin. Immediate DB/API denial does not mean immediate socket eviction |
| DELETE events reveal other rooms/tracks | Remove raw queue/tracks publication; publish member-readable revision/events and refetch authorized data | Review every added publication table/event. Supabase cannot apply deleted-row membership checks; filters are not a substitute |
| DoS / code guesses / serverless counter races | Persistent locked counters; failed join returns NULL to commit attempts; bounded JSON/media/chat/queue/playlist sizes | Auth/mail limits and unauthenticated traffic still depend on provider/platform settings; SQL exceptions roll back direct-RPC counters |
| Token exfiltration through API redirect / cookie CSRF | Bearer-header API, same-origin `/api/` helper, redirect disabled; no ambient auth cookie for privileged calls | XSS/browser extension compromise can steal local-storage Auth tokens and URL capabilities. Page-level CSP/security headers remain an integration review item |
| Malicious PR or compromised dependency/action | Read-only workflow permissions, immutable action pins, version+checksum-verified Gitleaks, isolated no-secret CI, lockfile `npm ci`, audit gate | Install/build code still executes on ephemeral runners. Scan/audit detect known patterns/advisories, not every compromise; update pins after review |
| Frozen/terminated Android page violates shared control | Recovery refetch, bounded timers, local audio independent of socket, no guest solo auto-next fallback contract | Web Media Session cannot guarantee execution/background sync or exact output alignment; all physical-device rows unverified |

## Authorization invariants

1. **No automatic administrator.** Legacy `is_admin` is ineffective with `is_active=false`; no promotion by email, account order, invitation code, user metadata, or first login.
2. **Active profile is required** for private API reads/writes and Jam RPCs. Invitation acceptance checks provider-held confirmed email and active issuer. Revoking an accepted invitation deactivates its associated ordinary profile; explicit operator admins use the trusted operator path.
3. **Independent track rights** for every listener. Owner/explicit/admin-owned-playlist-derived grants may authorize ordinary users unless an explicit track deny exists; admin rights remain administrative. `/stream` additionally requires ready status. Room/playlist UUID knowledge never authorizes bytes.
4. **Role and ownership checks live in SQL/API.** Ordinary playlist owners cannot redistribute track rights. Queue writes stay in checked command RPCs. A non-member cannot leave or mutate another room.
5. **Service-role is never the normal read client.** Server-only mutations have an already verified actor and a second transactional admin check. Client roles have no direct upload-intent/private-counter/receipt/GC writes.
6. **Revisions/idempotency are separate.** Stale new command rejects; exact ambiguous-commit retry returns its receipt; changed reuse rejects. Queue/mode changes preserve pending future anchors.
7. **Realtime topic secrecy is not authorization.** Private channel access and row policies are required. Do not ALTER the provider-owned `realtime.messages` table to enable RLS; it is already enabled. 0003 manages policies only.

## Credentials and capability lifetime

| Value | Permitted location | Handling |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/build/server | Public project identifier/key, protected by RLS/ACLs; set correct environment at build. Existing variable name retained |
| `SUPABASE_SERVICE_ROLE_KEY` | Server runtime / provider secret store | Broad privileged credential, never `NEXT_PUBLIC_*`, client import, log, URL or fixture |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Server runtime / provider secret store | One private bucket, Object Read & Write; no account-wide R2/admin scope |
| Supabase access/refresh tokens | User session, ephemeral guarded test contexts | Never committed `.auth*`, trace, screenshot or output; bearer APIs, refresh before expiry |
| R2 GET/PUT URLs | Intended user's current media/upload operation | Never share/log/query-analyze; signed headers must match; no app bearer token sent to R2 |
| `TEST_*` passwords/keys | Separate test shell/secret store only | Different stack/accounts/bucket from live; test runner must fail on missing configuration; no production fallback |

Grant/invitation revocation blocks new database/API authorization; it does **not** recall a five-minute GET or buffered/downloaded media. Delete/invalidate an object or revoke its signing credential for urgent byte-access containment, then test new requests. Key revocation can invalidate outstanding signatures; do not assume old-token signatures necessarily survive until TTL, or that buffered bytes disappear. R2 public-domain access would bypass this model entirely.

## Limits and error/log policy

Current per-user API quotas per minute: **read 180, write 60, upload 30, stream 120, invitation 10, chat 30**. Counters commit before API work; failed validation/provider work still consumes quota. 429 includes `Retry-After:60`. SQL mutation counters are separate; exceptions roll those transactions back. Join guessing is 20/minute and returns NULL on exhaustion/unavailability. OTP is controlled by Supabase Auth, not these API counters.

API JSON ≤32 KiB; audio ≤200 MiB; artwork ≤10 MiB; playlists ≤500 tracks; Jam queue ≤200; room chat 1–280 characters and allowlisted reactions; global chat 1–500. MD5 is single-PUT integrity/dedup, **not** collision-resistant authentication. No HTML/SVG artwork.

Return stable generic errors and no-store/Vary authorization headers. Operator evidence should contain request ID, route, HTTP/error code, time, track/room UUID and state revision only as needed. Exclude authorization headers, cookies, signed URL query strings, provider errors carrying credentials, emails/chat text from public CI output, and Auth storage states. Browser playback can be no-CORS while JS fetch/PUT needs CORS; do not “fix” playback by publishing storage.

## Repository/CI controls and current blockers

- `.github/gitleaks.toml` extends default rules and adds R2/Supabase credential, presigned capability and browser Auth-state detection. Default credential rules remain enabled; placeholders/files/tests are not blanket-exempted.
- `.github/workflows/secret-scan.yml` scans full fetched Git history on push/PR/manual/weekly events, redacts 100%, and ignores inline allow comments. No report artifact or cloud credential is uploaded. A failure requires incident triage/rotation, not an automatic baseline.
- `.github/workflows/adhurekisse-ci.yml` uses a fresh Linux install for typecheck/lint/tests/production build, high+ dependency audit and QA-owned `test:e2e:local`. Hosted tests/fixtures are intentionally an explicit **TEST-only** operator procedure documented in operations. Branch protection/check enforcement must be enabled by the repository owner; a workflow file alone does not enforce merges.
- `.gitignore` covers environment variants, Auth states, test outputs and generated fixtures; `.env.example` remains placeholders. Ignoring does not untrack already tracked files or erase Git history.

At this snapshot Next is **15.5.27**, Vitest is **5.0.4**, and the local typecheck, lint, unit/server, SQL, production-build and browser acceptance checks pass. `npm audit --audit-level=high` remains non-zero with 11 findings (8 high/3 moderate) in Tailwind/Next parser and nested PostCSS chains; available automatic fixes require major framework/tooling migrations. Hosted provider checks, deployment identity and physical Android tests remain unverified.

### Documentation/infrastructure verification

Completed locally on 2026-10-03:

- Gitleaks 8.30.0 scanned **58 committed Git-history commits**, with 100% redaction: no findings. Separate scans of the four new docs, `.github` configuration and placeholder `.env.example` also found none. No local secret env files were scanned/read.
- Synthetic-only checks verified all five added scanner rules detect their intended credential/capability/Auth-file patterns; default rules remain inherited.
- Actionlint 1.7.7 accepted both workflows; YAML/TOML parsing, documentation-relative links, recipe shell/Python/Node syntax and owned-path whitespace checks passed.
- Generated fixture PCM headers/durations/sizes and PNG chunk integrity passed in a temporary directory; generated media was removed. Guarded hosted recipe rejects missing TEST environment and the known live URL before network work; no hosted seed/acceptance was run.
- Exact owner-provisioning SQL ran against an isolated PGlite database: explicit confirmed UUID activation/missing-profile creation, inactive unrelated legacy profile preservation and missing-account rejection passed. This is SQL recipe validation, not hosted migration acceptance.

Verified locally on the current branch: `npm ci`, typecheck, lint, 81 unit tests, 20 server tests, AWS presign tests, 19 PGlite migration/RLS tests, production build and 27 substantive local browser acceptance tests. Three optional axe audit cases require `QA_AXE_SOURCE` and were skipped. No live-env build, hosted provider acceptance or physical-device run was performed.

## References

Official material consulted 2026-10-03: [Next production security](https://nextjs.org/docs/15/app/guides/production-checklist), [environment variables](https://nextjs.org/docs/15/app/guides/environment-variables), [R2 presigns](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [Supabase Auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [RLS/ACL/service bypass](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime cache/private authorization](https://supabase.com/docs/guides/realtime/authorization), [Postgres Changes limitations](https://supabase.com/docs/guides/realtime/postgres-changes), [Gitleaks configuration/CLI](https://github.com/gitleaks/gitleaks/tree/v8.30.0).
