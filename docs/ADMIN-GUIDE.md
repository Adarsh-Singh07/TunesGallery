# Owner's Guide — uploading your songs & jamming with a friend

> **Adhure Kisse supersession (2026-10-03):** For `sites/adhurekisse`, follow
> [ADHUREKISSE-OPERATIONS.md](ADHUREKISSE-OPERATIONS.md) and
> [ANDROID-TEST-MATRIX.md](ANDROID-TEST-MATRIX.md). Immediate upload/metadata,
> title-based deduplication, immediate object deletion, guaranteed background
> playback and automatic host-disconnect pause claims below are superseded by
> the audited upload/GC/Jam contracts and unverified device acceptance.
> **Registration update (2026-10-14):** The register/sign-in and code-based Jam
> instructions below describe **Adhure Kisse with migration 0004**. OnlyForYou
> remains unchanged and still requires its existing invitation provisioning.

This is the practical walkthrough for the person who owns the library.

---

## One-time setup

Follow `docs/DEPLOYMENT.md` once: create the Supabase project + R2 bucket,
run the migration, add the env vars to Vercel. After that, everything below
happens in the app itself.

## Register or sign in

1. Open Adhure Kisse and press **REGISTER** or **SIGN IN** (or go to `/login`).
2. New listeners choose **Create account**, enter a name, email and password,
   then confirm the email. They can listen to the curated archive alone as soon
   as they sign in.
3. Existing listeners can use a password or a 6-digit email code.
4. The verified owner account must be promoted to **owner** (`is_admin`) by the
   operator, after which the **ADMIN** button appears in the top bar.

## Upload your music (ADMIN → Uploads)

1. Tap **ADMIN** in the top bar → *Uploads* tab.
2. Drag files in (or tap to browse). MP3, M4A/AAC, OGG, WAV, FLAC — up to
   200 MB per file. Multiple files queue and upload one by one.
3. Each job shows live progress. You can **cancel** mid-upload and **retry**
   after a network failure. Titles are guessed from filenames — edit them
   while uploading.
4. When a job shows **READY**, the file was verified in private storage and
   is playable. Duplicates (same title + artist) are rejected so you don't
   upload a song twice.
5. The file goes straight from your phone/browser to R2 — it never sits on
   the website's server, and nothing is committed to the repo.
6. Deleting a track (Library tab) removes both the database row and the
   stored audio.

Your library now shows YouTube songs **and** your private tracks. Private
tracks play via the **Private** provider — full-quality audio, proper
lock-screen controls, and reliable background playback.

## Let a friend in (ADMIN → Access)

1. They register at `/login`, or you create an optional **invitation** for a
   direct sign-in link.
2. By default they can listen to the curated archive but hear **nothing
   private**. Grant them
   specific tracks with the *Grant track access* form.
3. They can use a password or an email code at `/login`.

## Jam with one friend

1. Both of you register/sign in. You press **JAM** → *Create a private room code*
   (optionally "allow my guest to control playback").
2. Send them the **invite link** or six-character code shown in the room panel
   (`…/?jam=CODE`). They sign in, then choose **JAM** → **Join** and enter the code.
   Alternatively, opening the link preserves the code through registration and
   sign-in and automatically joins after they enter the music room.
3. Add tracks to the **shared queue** from the picker in the panel and press
   **PLAY**. Both phones buffer first, then start together against one shared
   timeline — drift is corrected automatically (gently below 250 ms, by seek
   above it).
   Shared playback currently uses private audio that both accounts have already
   been granted. A room code does not grant private tracks; the curated archive
   remains available for solo listening.
4. While jammed: pause/seek/skip are shared; volume stays per-device; the
   **sleep timer** stops only *your* phone at the end; chat and emoji
   reactions ride alongside without touching sync.
5. Host leaves → room ends cleanly. Host closes the tab mid-song → the room
   pauses; reopen the invite link to resume from the shared timeline.

## What your friend hears when something's off

- **No grant for the track** → a clear "cannot access" message, never a
  broken player or a leaked file.
- **Invite expired** → "No open room with that code."
- **Second guest tries to join** → "This room already has two listeners."
