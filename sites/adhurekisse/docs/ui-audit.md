# Frontend UI audit and integration contract

## Ownership

Frontend changes live in `app/admin/page.tsx`, `app/login/page.tsx`, `app/library/page.tsx`, `components/Library.tsx`, and new `components/private-library/*` components/CSS plus frontend tests. Global styles, layout, room, player, auth helpers, server endpoints, and environment files are owned elsewhere.

## Audit findings

- The curated `Library` archive must remain available, with its original songs and search. Its dialog lacked focus containment/restoration and Escape handling; listbox semantics did not implement listbox keyboard interaction.
- Admin uploads started immediately, so edits were too late. Duration probing updated React state while finalization used an earlier snapshot. Cancellation during creation/queueing did not stop later work; cancellation cleanup used a stale track ID. Retry deleted and recreated rows instead of using the existing upload-url endpoint. Artwork failures were swallowed. Metadata editing, artwork replacement, grant listing/revocation, and upload file validation were missing.
- Login had uncaught transport failures, no resend cooldown, no returning-session handling, and misleading assumptions that every OTP email contained exactly six digits. `/callback` belongs to Spotify and must not receive Supabase links.
- Existing theme uses Playfair Display + DM Sans, dark violet surfaces and restrained accent colors. New CSS modules use those fonts, warm light/violet accents, visible focus rings, 44px targets, safe-area spacing, and reduced-motion support.

## Existing API contract audited

All privileged requests use `authedFetch` with a bearer token. Never put a token in a navigation URL.

| Endpoint | Frontend request | Expected response |
| --- | --- | --- |
| GET `/api/tracks` | `?offset=N` | `{tracks: TrackRow[],nextOffset:number|null}`; includes pending/failed for owner, optional short-lived `artworkUrl` |
| POST `/api/tracks` | `{title,artist,album?,movie?,year?,tags?,mimeType,sizeBytes}` | `{track,uploadId,upload:{url,headers}}`; 409 `DUPLICATE` |
| PATCH `/api/tracks/:id` | metadata fields + `duration_seconds` | `{track}` |
| DELETE `/api/tracks/:id` | no body | `{ok:true}` |
| POST `/api/tracks/:id/upload-url` | `{kind:'audio'|'artwork',mimeType,sizeBytes}` | `{key,uploadId,expiresAt,upload:{url,headers}}`; audio retry allowed only before ready |
| POST `/api/tracks/:id/finalize` | `{kind,uploadId,durationSeconds?}` | `{track}`; storage verification is mandatory; omit unknown duration (do not send null) |
| GET `/api/invitations` | no body | `{invitations:[{id,email,code,expires_at,accepted_at}]}` |
| POST `/api/invitations` | `{email,expiresInDays}` | `{invitation,delivery:'sent'|'existing_account'|'pending'}`; UI reports delivery accurately |
| DELETE `/api/invitations?id=…` | no body | `{ok:true}` |
| GET `/api/permissions` | no body | `{permissions:[{track_id,user_id,profiles?,created_at}]}` |
| POST `/api/permissions` | `{trackId,userId}` | `{ok:true}` |
| DELETE `/api/permissions?trackId=…&userId=…` | no body | `{ok:true}` |

Profiles are read through the existing Supabase client (`id,email,display_name,is_admin,is_active`). Session checks first use `rpc('accept_invitation')`; an existing Auth account alone does not mean access. Auth events defer additional Supabase calls with `setTimeout` to avoid the client auth lock. Audio limit: 200 MiB; artwork: JPEG/PNG/WebP/AVIF, 10 MiB. Storage PUT must use the exact signed headers; no app bearer token is sent to storage. Metadata duration must be greater than zero and no more than 86400 seconds.

## Main/server integration

- Add navigation to `/library` with `next/link`. The route is implemented here.
- `components/PlaybackContext` is supplied by main, with `usePlayer()` exposing `{manager,state,controls}`. Private library calls `manager.setSongs(...)` then `manager.selectSong(...)` **only on an explicit play action**; no render/fetch effect replaces the active queue.
- Playlist endpoint finalized at `/api/playlists` with GET/POST/PATCH/DELETE. GET returns `{playlists,nextOffset}`. Rows include `id,owner_id,title,revision,playlist_tracks:[{track_id,position}],playlist_permissions:[{user_id,grant_tracks}]`. POST sends `{title,trackIds}`; PATCH metadata/order sends `{id,title,trackIds,expectedRevision?}`; PATCH sharing sends `{id,userId,action:'share'|'unshare',grantTracks,expectedRevision?}`; DELETE sends `{id}`. Playlist mutations return `{playlist}`; deletion `{ok:true}`. Title aliases the database `name`. Only playlist owners edit/share; admin can additionally grant playlist track access.
- Uploads retain the track row and intent ID on cancellation/error. Retry uses a fresh reservation for failed bytes, retries finalization if bytes are already uploaded, and retries only artwork after audio is verified. Dismiss only removes the browser queue item; unfinished rows remain visible/deletable in Tracks.
- Invitation creation now attempts Auth email delivery and reports its result. Login activates a valid invitation via the audited RPC after OTP/password/magic-link sign-in. Supabase invite/site redirect must target `/login` (allowlisted); `/callback` is Spotify-owned.
- Revoking an accepted invitation can deactivate its associated listener, as implemented by the server; the action is explicitly labeled **Revoke room access**. Pending invitation revocation and per-track revocation have separate labels. Owner accounts are excluded from invitation revocation controls.
- OTP requests use `shouldCreateUser:false` and an allowlisted same-origin return path. Supabase defaults to magic links unless its email template includes `{{ .Token }}`. UI supports both, with code autofill/paste, resend cooldown, returning sessions, connection/rate/credential errors, and sign-out on an invalid invitation.
- Shared playlist deep links retain `/library?playlist=<UUID>` across sign-in. No additional redirect parameters or arbitrary return URLs are accepted.

## Official references

- [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), retrieved from the official repository: default magic-link template, `shouldCreateUser:false`, OTP verification, and redirect allowlisting.
- Supabase auth-state callback lock behavior was checked against the client implementation and the deferred callback pattern already used by the application.

## Verification

Completed local checks:

- **13 unit tests passed** in `tests/unit/privateLibrary{,Api}.test.ts`: media validation; metadata search/mapping; return-path validation; captured duration; cancellation during creation; same-row retry; artwork-only retry; session refresh/pre-refresh expiry; pagination; actionable auth/API errors.
- **18 desktop/mobile browser tests passed** using `tests/frontend/playwright.config.ts`: empty onboarding, mobile overflow, modal Escape/focus restoration, search/metadata/artwork validation, playlist create/order/rename/delete/share/revoke, duplicate queue detection, upload retry/finalization, invitation delivery, track grants/revocation, member boundary, session expiry, and no queue writes during fetch/render/refresh. Subsequent focused reruns passed after final playback/deep-link and accepted-invitation changes (6 + 4 cases).
- Owned-path `git diff --check` passed.
- `npm run typecheck -- --incremental false` reports **one integration blocker only**: `components/private-library/PrivateLibrary.tsx` cannot resolve `../PlaybackContext` because the main-owned module has not landed. Main must supply the promised provider and rerun the full typecheck.

The browser suite mounts the real owned components through a test-only Vite harness with navigation/player boundary shims. This verifies frontend interactions and request contracts; persistent player lifecycle and Next route integration belong to main's final checks. All Auth/storage/API requests are intercepted and fake public Auth settings are provided by the harness. No live cloud writes or credentials are used.

Normal commands on a platform-correct dependency installation:

```sh
npm run test -- tests/unit/privateLibrary.test.ts tests/unit/privateLibraryApi.test.ts
npx playwright test --config tests/frontend/playwright.config.ts
npm run typecheck -- --incremental false
```

This checkout has Windows native dependencies but the agent runs on Linux. Local verification used existing temporary Rollup/esbuild artifacts via `NODE_PATH=/tmp/omnirush/node_modules`, and a temporary Chromium shell/shared-library bundle outside the repository:

```sh
LD_LIBRARY_PATH=/tmp/omnirush/frontend-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=/tmp/omnirush/frontend-browsers \
NODE_PATH=/tmp/omnirush/node_modules \
npx playwright test --config tests/frontend/playwright.config.ts
```

No application dependencies, lockfiles, environment files, or production services were changed. Next dev startup on this checkout timed out; the isolated frontend harness avoided that environment blocker.
