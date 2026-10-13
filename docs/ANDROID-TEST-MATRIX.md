# Adhure Kisse Android acceptance matrix

Prepared **2026-10-03** for **`sites/adhurekisse`**. **Every physical-device scenario below is UNVERIFIED.** Unit tests, desktop Chromium phone emulation, isolated UI harness passes and builds are not Android hardware evidence. [Operations/test fixtures](ADHUREKISSE-OPERATIONS.md) · [architecture](ADHUREKISSE-ARCHITECTURE.md) · [security](ADHUREKISSE-SECURITY.md).

## Test setup and result discipline

- Use an isolated **TEST** app/Supabase project/private R2 bucket and accounts. Verify its source root and revision before tests. The user's existing `https://only-for-you-olive.vercel.app` currently shows OnlyForYou; it is not an accepted Adhure Kisse test target.
- Apply 0001/0002/0003; legacy test profiles inactive; provision a verified test-owner UUID explicitly, invite/activate the guest and grant both listeners the generated tones. Add an active ungranted outsider for negative cases. Never use live env, sessions or music as fixtures.
- Generate the low-amplitude 30-second and 600-second marker tones/PNG from the [runbook](ADHUREKISSE-OPERATIONS.md#7-safe-generated-fixtures-offline). Use synthesized derivatives for codecs; record encoding settings. A mocked byte buffer does not test decoding. Start at low device volume.
- Execute each scenario separately in **Chrome tab** and **installed PWA**, then repeat across an available Pixel/reference Android and Samsung/OEM device, including an older supported Android/Chrome if available. Record exact OS/browser versions instead of inferring behavior from model names.
- Record device/model, Android patch/version, Chrome version, app mode, deployed Git revision, exact test origin, test date/time/timezone, account role, codec/duration, output route, Wi-Fi/cellular conditions and battery restrictions. No device was available in this documentation work.
- Update only actually executed cells with PASS/FAIL/BLOCKED, date and private evidence reference; leave others UNVERIFIED. Capture repro steps, expected/observed behavior, recovery duration, output drift and errors. Scrub JWTs/Auth states/signed URL queries/emails/chat from screenshots, HARs, videos and console exports.

Suggested run record:

| Field | Value |
|---|---|
| Device / Android / Chrome / patch | UNVERIFIED — not recorded |
| Chrome tab or installed PWA / test origin / app revision | UNVERIFIED — not recorded |
| Test project / test bucket / roles (no secrets) | UNVERIFIED — not recorded |
| Output / network / battery policy | UNVERIFIED — not recorded |
| Date / tester / private evidence | UNVERIFIED — not recorded |

## Player and accessibility

| ID | Scenario / procedure | Acceptance / measurement | Chrome tab | Installed PWA |
|---|---|---|---|---|
| P01 | Tap to start private WAV; deny initial autoplay on a fresh session | Honest Enable audio/tap-play state; no false playing; explicit gesture starts selected track | UNVERIFIED | UNVERIFIED |
| P02 | Navigate room → library → admin → back while playing | Same audio lifetime; continuous track/time; no duplicate element/ghost playback, queue not rewritten on fetch/render | UNVERIFIED | UNVERIFIED |
| P03 | Play, pause, resume and seek while paused/playing near start/end | Actual audio/position matches selected action; valid duration; no unsolicited resume | UNVERIFIED | UNVERIFIED |
| P04 | Seek the long tone after >5 minutes; pause >5 minutes then resume | Reauthorize expired URL, preserve intended position/state; bounded error if revoked; no permanent spinner | UNVERIFIED | UNVERIFIED |
| P05 | Queue two short generated tracks; next/previous/repeat/shuffle | Exactly one intentional transition; meaningful previous semantics; no overlap | UNVERIFIED | UNVERIFIED |
| P06 | Replace cover/metadata; lock screen and expand notification | Current title/artist/cover and position; no stale private URL shown/logged; artwork refresh behavior recorded | UNVERIFIED | UNVERIFIED |
| P07 | Lock screen controls: play/pause/next/previous/seek/stop | Supported controls obey current solo/Jam role; unsupported OS controls recorded; no guest authority bypass | UNVERIFIED | UNVERIFIED |
| P08 | Lock 5/15/30 minutes and switch apps while private tone plays | Record continuity/gaps, next behavior and recovery; background survival is a measured device result | UNVERIFIED | UNVERIFIED |
| P09 | Synthesized MP3, AAC/M4A, Opus/Ogg, FLAC and WAV separately | Accepted MIME/magic plus actual decode/seek/duration; unsupported codec has actionable error | UNVERIFIED | UNVERIFIED |
| P10 | Slow/missing/corrupt media and rapid track selection | Bounded load timeout/cancel, latest selection wins, stale audio never starts | UNVERIFIED | UNVERIFIED |
| P11 | Bluetooth connect/disconnect and headset transport controls | Record latency, route changes/gaps, volume locality and authority; no loud duplicated output | UNVERIFIED | UNVERIFIED |
| P12 | Wired/USB headset plug/unplug | Record pause/output-route behavior and safe recovery; no accidental shared command from route-only change | UNVERIFIED | UNVERIFIED |
| P13 | Incoming call/alarm/other-media audio focus | Record pause/duck/resume behavior; explicit recovery works; no false Jam readiness | UNVERIFIED | UNVERIFIED |
| P14 | Wi-Fi → mobile data → Wi-Fi mid-track, then airplane mode 30 seconds | Record buffer survival and time-to-recovery; intentional play/seek recovers after network returns | UNVERIFIED | UNVERIFIED |
| P15 | Battery saver/OEM restrictions on and off; app switch 30 minutes | Record kills/freezes separately from network failures; do not declare guaranteed background playback | UNVERIFIED | UNVERIFIED |
| P16 | Swipe away/force-stop browser or PWA; reopen/full reload | No promise of continuity; clean new player/session; room rejoin explicit, no stale sleep auto-resume | UNVERIFIED | UNVERIFIED |
| P17 | TalkBack, keyboard/external switch, large text and reduced motion | Labeled controls/errors, logical focus, dialog containment/Escape/return, readable reflow, ≥44px targets/safe areas | UNVERIFIED | UNVERIFIED |
| P18 | Optional curated YouTube provider foreground/background comparison | Record separately from private R2 audio; iframe/provider restrictions are not private-player results | UNVERIFIED | UNVERIFIED |

## Two-person Jam and private access

Run both **host-on-A/guest-on-B** and swapped roles; test mixed tab/PWA pairs and shared/different networks. Measure actual speaker output with a third recorder or two-channel capture; do not call two `currentTime` readings an audio-output measurement. Use periodic marker peaks, record sample rate and hardware uncertainty; Bluetooth adds asymmetric output latency.

| ID | Scenario / procedure | Acceptance / measurement | Chrome pair | PWA / mixed pair |
|---|---|---|---|---|
| J01 | Invite-only login, expired/revoked invitation, ungranted/outsider accounts | Correct activation/denial; owner UUID explicit; no private data/stream/admin route access on denial | UNVERIFIED | UNVERIFIED |
| J02 | Create six-character room code, join guest, third listener tries | One host/one guest; generic unavailable for denied/full/invalid/null join; code grants no track access | UNVERIFIED | UNVERIFIED |
| J03 | Join/select/queue a tone not independently granted to one listener | Server denies track/room admission as appropriate; no presign minted for denied listener | UNVERIFIED | UNVERIFIED |
| J04 | One device slow/autoplay-blocked, then both ready; schedule nonzero start | No audible start before anchor; no forced readiness timeout bypass; record actual start offset | UNVERIFIED | UNVERIFIED |
| J05 | Both visible: pause/play/seek/track swap, paused seek and rapid commands | Shared authoritative revision/state converges; no stale load or guest solo action; measure settle/drift | UNVERIFIED | UNVERIFIED |
| J06 | Host-only guest attempts page/headset/notification controls | Playback/queue authority denied; guest can suggest; volume/mute stay local | UNVERIFIED | UNVERIFIED |
| J07 | Collaborative guest play/seek/skip/select queue item | Authorized commands apply once; atomic queue consumption; general queue reorder/add/remove remain host-only | UNVERIFIED | UNVERIFIED |
| J08 | Host reorder/remove/skip + ambiguous retry or concurrent command | One logical mutation; revision conflicts recover, exact retry idempotent; changed command-ID reuse denied | UNVERIFIED | UNVERIFIED |
| J09 | Short tone ends on both providers | Only host auto-next issues shared mutation; guest never locally advances, including frozen host | UNVERIFIED | UNVERIFIED |
| J10 | Visible 10-minute long-tone playback | Record initial/end drift and correction artifacts; output metrics separate from RTT/clock estimate | UNVERIFIED | UNVERIFIED |
| J11 | Lock one phone 5 minutes, then both; unlock | Record background drift; fresh authoritative read/catch-up on return, no duplicate socket/timer/audio | UNVERIFIED | UNVERIFIED |
| J12 | Guest offline 2 minutes, reconnect; host offline separately | Buffer may continue; no authority election; recovery refetches room/track/queue/messages and catches up | UNVERIFIED | UNVERIFIED |
| J13 | Freeze/tab switch/page restore and repeated online events | One recovery/backoff path; stale callback inert; state after SUBSCRIBED refreshed | UNVERIFIED | UNVERIFIED |
| J14 | Set local sleep timer; remote pause/play/seek around expiry | Only sleeping device pauses; remote command does not cancel sleep; late wake catches up, no shared pause | UNVERIFIED | UNVERIFIED |
| J15 | Guest leave, host leave/end, remote end and room expiry | Correct paused/open or ended authority; override released; buffered audio can continue locally without new rights | UNVERIFIED | UNVERIFIED |
| J16 | Send own/peer chat/reaction; retry/reconnect and forged publication | Persisted identity/echo/dedup/delivery status; missed messages refetch; no forged Broadcast/Presence identity | UNVERIFIED | UNVERIFIED |
| J17 | Revoke track or deactivate listener while playing/connected | New API/RPC deny; record old URL ≤5-minute capability and cached socket JWT window, no instant-recall claim | UNVERIFIED | UNVERIFIED |
| J18 | Share/unshare playlist; explicit deny while playlist-derived grant exists | Link alone no rights; explicit deny wins; independent grants survive unshare; unauthorized entries filtered | UNVERIFIED | UNVERIFIED |
| J19 | Upload/cancel/retry/artwork on phone using generated fixtures | Exact headers/CORS; correct progress/captured duration; old cover survives failed/stale replacement | UNVERIFIED | UNVERIFIED |
| J20 | Session expiry/token refresh mid-Jam and app navigation | Honest expired state; refresh/rejoin/re-read authorized authority; no duplicated transport handlers | UNVERIFIED | UNVERIFIED |

## Acceptance targets and platform boundaries

Targets are **proposed acceptance criteria, not measured guarantees**: on two foreground devices with healthy network and the same output route, aim for start/output alignment within **250 ms**, drift settlement within **5 seconds** after returning to foreground, and recoverability after a single network interruption. Record any greater tolerance required by observed RTT/buffering/output latency instead of quietly redefining a pass. Measure correction clicks/rate artifacts, readiness timeouts, battery impact and host auto-next behavior as well as drift.

Android can throttle/freeze timers and WebSockets, terminate pages, block autoplay and suspend media depending on Chrome/OEM/battery/audio-focus policy. An installed PWA still has browser lifecycle constraints. The current service worker deliberately does not cache private APIs/media or run a background player. No offline private library, DRM, permanent background Jam, sample-accurate sync or reliable auto-next while the host is frozen is promised. Full page reload does not automatically rejoin or restore a personal sleep timer.

## Media3 native decision boundary

Official [Media3 background-playback guidance](https://developer.android.com/media/media3/session/background-playback) was consulted on 2026-10-03 (page updated 2026-10-01), alongside [MediaSessionService's official lifecycle/source](https://github.com/androidx/media/blob/release/libraries/session/src/main/java/androidx/media3/session/MediaSessionService.java).

A future native player would host `Player`/ExoPlayer and `MediaSession` inside `MediaSessionService` (or `MediaLibraryService` for browsing), use UI `MediaController`, declare `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PLAYBACK` and `mediaPlayback` service type, and handle service teardown/audio focus/controller authorization and token/URL renewal. Media notifications and ongoing playback are service-managed; resumption requires explicit implementation. Paused/stopped/failed playback without interaction transitions out of foreground service after about ten minutes under the documented default. These APIs do not automatically implement the Jam protocol or defeat force-stop/OEM/network restrictions. A WebView/PWA wrapper alone supplies none of this native service architecture. **No native app or Media3 implementation was built or tested.**
