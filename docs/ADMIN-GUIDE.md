# Owner's Guide — uploading your songs & jamming with a friend

This is the practical walkthrough for the person who owns the library.

---

## One-time setup

Follow `docs/DEPLOYMENT.md` once: create the Supabase project + R2 bucket,
run the migration, add the env vars to Vercel. After that, everything below
happens in the app itself.

## Sign in

1. Open your site and press **SIGN IN** (or go to `/login`).
2. Enter your email → you receive a 6-digit code → enter it → you're in.
3. Your account is the **owner** (`is_admin`), so you see the **ADMIN**
   button in the top bar.

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

1. Create an **invitation** for their email.
2. Create an auth account for that email in the Supabase dashboard
   (Authentication → Users → Add user) — signup is closed, so you provision
   accounts.
3. By default they can sign in but hear **nothing private**. Grant them
   specific tracks with the *Grant track access* form.
4. They never need a password: they sign in at `/login` with an email code.

## Jam with one friend

1. Both of you sign in. You press **JAM** → *Create a private room*
   (optionally "allow my guest to control playback").
2. Send them the **invite link** shown in the room panel
   (`…/?jam=CODE`). Opening it signs them in and joins the room automatically.
3. Add tracks to the **shared queue** from the picker in the panel and press
   **PLAY**. Both phones buffer first, then start together against one shared
   timeline — drift is corrected automatically (gently below 250 ms, by seek
   above it).
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
