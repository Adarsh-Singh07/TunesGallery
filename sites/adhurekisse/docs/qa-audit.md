# Browser QA audit — 2026-10-03

## Result

Automation is implemented against the **actual Next application**. The complete suite is **not green** while playback integration is being implemented.

- Local inventory: **30 tests**, independently discoverable in `tests/playback/playwright.config.ts`.
- Completed scoped runs exercised **17 distinct local tests: 11 passed, 6 failed**. The other 13 library-dependent checks were not run after the missing-context compilation failure was confirmed.
- A final smoke rerun after adding the intercepted YouTube SDK handshake passed both native-audio playback and the 320 px layout check.
- Hosted inventory: **5 acceptance tests explicitly skipped** because E2E credentials and seeded-track variables were absent. No hosted/cloud acceptance result is claimed.
- Test-only TypeScript check passed. No application build was run by this QA task.

## Coverage and boundaries

`tests/playback/serve-next.mjs` stages the current source, including untracked implementation files, into an isolated temporary directory and starts Next 15.5.24. It copies an explicit source/config allowlist; `.env.local`, other `.env` files, and git metadata are not read or copied. The server receives a fake public Supabase URL/key and empty server/R2 credentials.

Browser requests use a test-side Supabase Auth/PostgREST/Phoenix-WebSocket contract emulator, two independent authenticated browser contexts, and generated 90-second PCM WAVs. Requests to external fonts, artwork optimization, weather, and YouTube are intercepted. The unrelated initial YouTube SDK handshake has a small contract stub that emits no audio. Native `HTMLAudioElement` decoding, time progression, pause, keyboard seek, and HTTP byte ranges are used as the private-audio acceptance signal.

The local suite checks:

- Actual unauthenticated Next API handlers: 24 read/write requests, including track stream/upload/finalize, playlist CRUD/tracks/sharing, invitations, permissions, cleanup, and chat.
- Private audio selected in the actual music archive; bearer authorization only on the same-origin stream request; no bearer token sent to the audio host; no signed fixture URL persisted in localStorage.
- Persistent playback across Next links and history navigation, delayed authorization/newer-selection races, failed authorization, library search/details, and sign-out.
- Host/guest Jam create/join, both-device readiness and native playback, measured drift, pause/resume/seek/next, guest suggestion, collaboration permissions, saved chat/reactions, local timer controls, offline/reconnect, room end, and solo restoration.
- Failed Realtime handshake cannot produce a live claim; invalid invitations and occupied-room denial with three contexts.
- Real service-worker registration/control, manifest/icon delivery, ranged audio requests, and Cache Storage observations.
- Separate music-room/Jam and private-library layout checks at 320, 360, 375, 390, 414, 430, 768, and 1440 px.
- Measured console exceptions/errors, navigation timings, and axe WCAG A/AA/2.1 AA rules on actual Next routes. Axe is enabled with `QA_AXE_SOURCE`; absence produces an explicit accessibility-audit skip.

Mocked Jam integration is **not verification of Supabase RLS, deployed Realtime authorization, real R2 signatures/CORS, or two physical phones**. Local UI assertions never establish live cloud behavior. Hosted acceptance signs in through the real password UI with independent contexts and requires a seeded test deployment.

## Completed runs

| Run | Result | Duration | Evidence |
| --- | --- | --- | --- |
| Actual Next unauthenticated API matrix | 1 test passed; all 24 requests returned 401 | 43.0 s including server startup; test 21.6 s | `/tmp/omnirush/adhurekisse-api-report.json` |
| Browser/audio/layout/a11y/PWA scope | 10 passed, 3 failed | 260.8 s | `/tmp/omnirush/adhurekisse-browser-report.json` |
| Two-context Jam, room denial, navigation persistence | 3 failed on integration blockers | Approximately 2 minutes | `/tmp/omnirush/adhurekisse-integration-report.json` |
| Final native-audio + 320 px smoke | 2 passed | 1.6 min | `/tmp/omnirush/adhurekisse-smoke-report.json` |
| Hosted acceptance without credentials | 5 explicitly skipped | No hosted browser flow executed | Root `playwright.config.ts` |
| Test-only TypeScript | Passed | — | `tsc -p tests/playback/tsconfig.json` |

Screenshots and failure traces are in matching `*-results` directories. These are temporary local artifacts, not committed fixtures. The local report helper prints sanitized measurements:

```sh
node tests/playback/report-summary.mjs /tmp/omnirush/adhurekisse-browser-report.json
```

Earlier cold-start and interrupted-server attempts timed out and are not counted as successful runs. The first mounted-dependency attempt needed 115 s for Next startup and 103.2 s for `/login` compilation. Linux dependencies plus an isolated cached Turbopack stage reduced a later startup to 3.5 s and `/login` compilation to 9.1 s. A process left by a forcibly interrupted shell run must be stopped before another run; `QA_REUSE_SERVER` is opt-in, not the default.

## Measured findings

### API/security — passed

All 24 implemented unauthenticated requests returned **401**, included `Cache-Control` with `no-store` and `X-Content-Type-Options: nosniff`, and returned no URL, object key, service-role marker, or access token. These calls reached real Next handlers; no API responses were intercepted in this matrix. This does not establish authenticated authorization/RLS correctness.

### Native audio — passed

The music-archive test decoded a generated private WAV in Chromium with duration **90 s**, `readyState = 4`, and advancing playback; the attached observation was at **6.736027 s** after a keyboard seek. Pausing stopped the native media element. A ranged request was observed; authorization was present on stream-URL acquisition and absent on audio-host requests. Only one provider-created audio element was observed. The final SDK-stub smoke rerun also passed.

### Responsive music room/Jam — passed

All eight widths passed document/dialog horizontal-overflow checks (at most 1 px rounding tolerance), dialog viewport containment, keyboard focus containment, and Escape dismissal. Full-page screenshots were attached. These checks cover the music room and initial Jam dialog; private-library layouts are still awaiting a compilable library route. These are geometry/interaction checks, not pixel-baseline visual regression.

### Playback/Jam integration — blocked

The browser displayed **“The player is not ready for Jam yet. Try again in a moment.”** on room creation and joining. In the tested source snapshot, `PlaybackManager` lacked `setTransportHandlers`, which `useJam` requires before sending room RPCs. The two-context test therefore did not reach readiness or synchronized audio, and the no-false-live/occupied-room scenarios cannot yet be certified.

`/library` returned **500** with:

```text
components/private-library/PrivateLibrary.tsx:7
Module not found: Can't resolve '../PlaybackContext'
```

`components/PlaybackContext.tsx` had not appeared in the shared working tree at the final availability check. Link/history persistence, delayed selection, authorization failure, library sign-out/details, and library widths/a11y require a rerun after the main playback implementation is available. Tests retain real acceptance assertions; they are not marked as expected failures to conceal these blockers.

### Accessibility and console

Measured using axe-core **4.13** on desktop Chromium:

| Surface | Serious/critical violations | Other observed violations | Browser console errors / uncaught exceptions |
| --- | --- | --- | --- |
| `/login` | 0 | `meta-viewport` (moderate): maximum-scale disables zoom | 0 / 0 |
| Music room `/` | 1 serious `aria-prohibited-attr` | `meta-viewport` (moderate) | 0 / 0 |
| Initial Jam dialog | 0 | None in the dialog-scoped scan | Same page observation |

The serious finding targets `.record-scene[aria-label="Vinyl record"]`: an accessible label is applied to a generic div without a valid role. The viewport finding originates in the root layout’s `maximumScale: 1`. The audit fails on serious/critical violations and reports moderate findings. A passing audit assertion is not a complete WCAG certification, and the deployed room/chat state was not scanned.

### PWA/private-cache observation — cache checks passed; icon check failed

The real service worker became the page controller. An unauthenticated `/api/tracks` browser fetch returned **401**. Two ranged audio fetches each returned **206** with **60 bytes**, both reached the fixture responder, and observed Cache Storage entries were **empty**.

The manifest’s `/icon.svg` returned **500**. Next reported a conflicting public/page file because both `app/icon.svg` and `public/icon.svg` define that path. The PWA test correctly remains failed despite the successful private-cache assertions. Installed standalone/background/lock-screen behavior was not exercised.

### Performance observations

These are single desktop **development-server** samples with mocked external resources, not production Web Vitals or performance budgets:

| Page | TTFB | DOMContentLoaded | Load event | Resource entries |
| --- | ---: | ---: | ---: | ---: |
| `/login` | 1,035.7 ms | 1,511.1 ms | 3,014.0 ms | 20 |
| `/` (compiled during navigation) | 11,066.8 ms | 12,880.8 ms | 15,751.7 ms | 34 |

The initial Jam-dialog scan shares the home navigation entry; it is not an independent navigation timing. Browser console measurements exclude server-only Next warnings. The server also warned that background-image quality 90 is not configured for future Next 16 behavior.

## Reproduce local checks

From `sites/adhurekisse`, with normal Linux dependencies and a Playwright Chromium installation:

```sh
node node_modules/@playwright/test/cli.js test --config tests/playback/playwright.config.ts
node node_modules/typescript/bin/tsc -p tests/playback/tsconfig.json
```

The environment used for completed browser runs:

```sh
QA_STAGE_DIR=/tmp/omnirush/adhurekisse-next-37Zyqv \
QA_NEXT_TURBO=1 \
QA_NODE_MODULES=/tmp/omnirush/qa-next-runtime/node_modules \
PLAYWRIGHT_BROWSERS_PATH=/tmp/omnirush/frontend-browsers \
LD_LIBRARY_PATH=/tmp/omnirush/frontend-libs/usr/lib/x86_64-linux-gnu \
QA_AXE_SOURCE=/tmp/omnirush/qa-runtime/node_modules/axe-core/axe.min.js \
node node_modules/@playwright/test/cli.js test --config tests/playback/playwright.config.ts
```

Omit `QA_STAGE_DIR` to create a fresh stage. An explicitly reused stage must already exist, be named `adhurekisse-next-*`, and be directly inside `QA_STAGE_PARENT` (default `/tmp/omnirush`). The source allowlist is recopied at startup so new implementation files are included. Turbopack copies the temporary dependency tree because it rejects node_modules symlinks outside its filesystem root; the default webpack runner uses a dependency symlink. The Linux runtime in `/tmp` contains the project’s Next/React/Supabase/AWS/UI/CSS dependencies; no dependency manifest or lockfile was changed by QA. Temporary axe-core can be installed separately and passed via `QA_AXE_SOURCE`.

Other options: `QA_PORT`, `QA_OUTPUT_DIR`, `QA_REPORT`, `QA_STAGE_PARENT`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The supplied Rollup/esbuild binaries remain usable through `NODE_PATH=/tmp/omnirush/node_modules`; the Linux Next runtime was installed separately to avoid mounted-drive dependency traversal.

## Hosted acceptance setup

The root config needs these variables to run rather than explicitly skip:

```text
E2E_BASE_URL
E2E_HOST_EMAIL / E2E_HOST_PASSWORD
E2E_GUEST_EMAIL / E2E_GUEST_PASSWORD
E2E_TEST_TRACK_TITLE
E2E_SECOND_TRACK_TITLE
```

Both password accounts must be active, invited accounts in the seeded test deployment. Both named ready private tracks must be playable by both accounts, sufficiently long for the flow, and have distinct titles. `E2E_THIRD_EMAIL` / `E2E_THIRD_PASSWORD` enable the separate occupied-room acceptance; `E2E_RESTRICTED_TRACK_ID` enables authenticated-ungranted stream denial. Those additional cases explicitly skip without their own fixture variables. The app itself supplies its configured Supabase settings; the tests sign in through its actual UI and do not write persisted auth-state files.

```sh
node node_modules/@playwright/test/cli.js test --config playwright.config.ts
```

## Official Playwright guidance applied

- [Best practices](https://playwright.dev/docs/best-practices): user-visible acceptance assertions, role/label locators, isolated contexts, web-first expectations, and failure traces.
- [Network and service workers](https://playwright.dev/docs/network#missing-network-events-and-service-workers): block service workers for deterministic interception; use a separate explicitly SW-enabled PWA case.
- [API mocking](https://playwright.dev/docs/mock): intercept dependencies rather than rely on uncontrolled third-party availability. Native media remains genuine browser behavior.
