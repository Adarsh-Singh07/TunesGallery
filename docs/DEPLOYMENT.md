# Deployment & Configuration Guide

Applies to **both** `sites/adhurekisse` and `sites/onlyforyou` — they share the
same private-library + Jam architecture. Each site can point at its **own**
Supabase project and R2 bucket (recommended), or share one.

---

## 1. Supabase setup (auth, database, realtime)

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: open **SQL Editor** and paste the full contents of
   `sites/<site>/supabase/migrations/0001_init.sql`, then run it. It creates
   every table, RLS policy, and the `jam_*` RPC functions.
3. **Authentication settings** (Dashboard → Authentication):
   - **Email**: enable the one-time-code (magic link) provider.
   - **Allow new users to sign up: OFF.** This is the invitation gate — OTP
     sign-in only works for accounts you create (next step).
4. **Create yourself (the owner)**: Authentication → Users → *Add user* with
   your email + a password (or invite yourself via OTP after temporarily
   allowing signups, then turn it off again).
   - The `handle_new_user` trigger creates a profile automatically and makes
     **the very first profile the admin** (`is_admin = true`). If you already
     created profiles and none is admin, promote yours manually:
     ```sql
     update public.profiles set is_admin = true where email = 'you@example.com';
     ```
5. **Invite friends**: easiest through the app — sign in, open `/admin` →
   *Access* → create an invitation, share the code. Then create the auth user
   for their email in Dashboard → Authentication → Users (signup is disabled,
   so the owner provisions accounts). They sign in with **email OTP** on
   `/login` using any email client.
6. **Realtime**: the migration already adds `jam_room_state`, `jam_queue`,
   `jam_participants` and `tracks` to the `supabase_realtime` publication.
   RLS filters change events to room members automatically.

### Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | safe to expose (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | used for storage bookkeeping; never ship to the browser |
| `R2_ACCOUNT_ID` | server only | Cloudflare account id |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | server only | R2 API token scoped to ONE bucket |
| `R2_BUCKET_NAME` | server only | e.g. `adhurekisse-audio` |

When Supabase env vars are absent the site falls back to **open access**
(current behavior) — nothing breaks before you configure anything.

---

## 2. Cloudflare R2 (private music storage)

1. Create a bucket (e.g. `adhurekisse-audio`). Leave **public access OFF**.
2. Create an **API token** (Account → R2 → Manage API tokens):
   - Permission: *Object Read & Write*
   - Scope: **only this bucket**
   - Note the Access Key ID / Secret Access Key and your Account ID.
3. **CORS**: the browser PUTs uploads and GETs streams directly against the
   bucket, so the bucket needs a CORS policy (R2 → Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://*.vercel.app",
      "https://adhurekisse.adarshsingh.in"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": [
      "content-type",
      "x-amz-sdk-checksum-algorithm",
      "x-amz-checksum-crc32"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Important: **`https://*.vercel.app` must stay in the list** — Vercel issues a
unique preview URL for every deployment, so exact preview origins will break
on the next deploy. This is safe: CORS only governs which *browser origins*
may present a request; the actual authorization is the short-lived presigned
URL itself, which only your server can mint.

### How access control works

- Objects live under server-generated keys (`audio/<uuid>/original.mp3`) —
  user filenames never touch a storage path.
- The browser never sees R2 credentials. It receives **1-hour presigned GET
  URLs** from `/api/tracks/[id]/stream`, only after RLS confirms access
  (owner / admin / explicit grant / active jam participant).
- Uploads stream **directly from the browser to R2** through a 15-minute
  presigned PUT; the server only touches metadata, then verifies the object
  exists (HEAD) before marking the track ready.
- Seek works via native HTTP Range requests; the service worker never
  intercepts media or `/api/*` traffic, so nothing private is cached.

---

## 3. Deploy

Both sites are standalone Next.js apps; deploy exactly as before (Vercel with
the site folder as Root Directory). After your first deploy with env vars set:

1. Sign in at `/login` with the owner account.
2. Open `/admin` → *Uploads* and add a couple of files.
3. Play one — the player automatically prefers "Private" over YouTube.

---

## 4. Local development

```bash
cd sites/adhurekisse      # or sites/onlyforyou
npm install
cp .env.example .env.local   # fill in placeholders
npm run dev                  # :3000 (adhurekisse) / :3001 (onlyforyou)

npm run typecheck            # tsc --noEmit
npm test                     # vitest unit tests (no services needed)
npm run test:e2e             # playwright — needs E2E_* env vars + seeded stack
```

## 5. Credential rotation

- **Supabase service key / anon key**: Dashboard → Settings → API → *Rotate*,
  then update the Vercel env var and redeploy.
- **R2 token**: Account → R2 → Manage API tokens → *Roll*. Presigned URLs
  issued by the old token stay valid until expiry (≤1 h).
- Rotate immediately if any key lands in a log, screenshot, or repo.
