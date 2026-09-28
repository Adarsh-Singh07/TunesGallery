# Known limitations, unverified assumptions & security notes

Honest record of what is implemented, what is *not*, and what could not be
verified without real devices / live services.

---

## What was verified in this workspace

- `tsc --noEmit` clean on **both** sites.
- Production builds succeed on **both** sites (all routes compile).
- **30/30 unit tests pass** per site: timeline math (expected position, drift
  classification at the 80/250 ms boundaries, nudge-rate clamping), NTP-style
  clock estimation (symmetric + asymmetric delay behavior), and the Jam
  command path (role authorization, revision-guard rejection + refetch,
  state-machine transitions, ended-room rejection).
- Static review of every new API route and RLS policy.

## What requires the owner's live stack (documented, not run here)

These need real Supabase + R2 credentials and were **not** executed:

- Applying `supabase/migrations/0001_init.sql` to a live project.
- Real uploads to / streams from R2 (CORS config, presigned URL TTLs).
- Live Supabase Auth OTP round-trip and the `handle_new_user` bootstrap.
- Realtime postgres_changes delivery against real RLS.
- The Playwright suite in `tests/e2e/` — specs are complete and skip
  themselves with a clear message until `E2E_*` variables exist. **No e2e
  result is claimed.**

## Android / PWA limitations (cannot be bypassed in a PWA)

- **Screen-off playback**: R2 audio via Media Session generally keeps playing
  with the screen off on Android Chrome/installed PWA; YouTube-provider
  playback can still be throttled when the tab is backgrounded (iframe
  limitations — the silence.wav keep-alive helps but is not a guarantee).
- **Background jam sync**: Android suspends JS timers and may freeze
  WebSocket traffic for backgrounded apps. Local audio keeps playing; the
  drift loop pauses and **resynchronizes on foreground**. Two phones locked
  in a jam will drift apart until one is foregrounded — this is an OS
  constraint, not a bug, and is why the design keeps audio independent of
  the realtime connection.
- **Battery optimization**: aggressive OEM battery savers (Xiaomi, Samsung
  etc.) can kill the PWA entirely. Advise excluding the site/PWA from
  battery optimization on the devices you use.
- **Native wrapper**: for guaranteed background sync + media controls, a
  Media3/ExoPlayer-based Android app would be the upgrade path. Not built,
  per scope.

## Security posture & residual risks

Implemented: RLS on every table; invitation-only auth (public signup off);
per-track grants; jam participation grants access **only to the currently
shared track**; server-side validation of MIME/size; presigned URLs (1 h
stream / 15 min upload); bearer-token API auth (no cookie CSRF surface);
storage keys from UUIDs, never filenames; URLs never logged; hardened
service worker (no caching of `/api/*`, ranged, or cross-origin traffic).

Residual risks worth knowing:

- **Presigned URLs are bearer tokens.** Anyone holding one can stream until
  expiry (≤1 h). They live in memory + the audio element only; still, don't
  share screen recordings of devtools.
- **Realtime channel names are capability URLs** (`jam:<room-uuid>`). Room
  UUIDs are non-guessable and only revealed to room members, so broadcast
  chat/reactions are effectively member-only — but they are not cryptographically
  bound to a session the way DB access is. Authoritative actions always are
  (RPC + RLS).
- **First-user-becomes-admin bootstrap**: if the migration runs after several
  users already exist (only possible if signup was enabled), check
  `profiles.is_admin` and set it deliberately.
- **Rate limiting** on `/api/*` is left to Vercel's platform protections;
  the audience is a handful of invited people. Add middleware-based limiting
  before ever widening access.
- **Email content**: OTP mails reveal that a Supabase project exists — fine
  for a private room.

## Real-device test matrix (owner runs this once hardware is available)

Mark each row ✅/❌ with the device + date. Nothing below is claimed as passed.

| Scenario | Android Chrome | Installed PWA |
|---|---|---|
| Lock screen: play/pause/next/prev/notification artwork | ☐ | ☐ |
| Lock screen seek (progress bar scrub) | ☐ | ☐ |
| App switch → audio continues (R2 track) | ☐ | ☐ |
| App switch → audio continues (YouTube track) | ☐ | ☐ |
| Bluetooth headphones: controls + artifact-free connect | ☐ | ☐ |
| Wired headphones | ☐ | ☐ |
| Incoming call pauses; resumes cleanly after | ☐ | ☐ |
| Wi-Fi → mobile data mid-song → recovery time | ☐ | ☐ |
| Airplane mode 30 s mid-song → error vs recovery | ☐ | ☐ |
| Battery saver ON → 30 min playback survival | ☐ | ☐ |
| Two phones in jam: start together, measured drift after 10 min | ☐ | ☐ |
| Jam: phone locked 5 min mid-song → resync on unlock | ☐ | ☐ |
| Jam: guest leaves network 2 min → rejoin at right position | ☐ | ☐ |

Suggested acceptance: start-together within 250 ms; post-lock resync within
5 s; no permanent audio failure on any single-network blip.
