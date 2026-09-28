# TunesGallery

> A multi-site, data-driven music archive monorepo.

Each website lives independently inside `sites/<site-name>/` and is deployed as its own Vercel project by setting that folder as the **Root Directory**.

---

## Sites

| Site | Description |
|------|-------------|
| [`sites/adhurekisse`](sites/adhurekisse/) | An immersive late-night Bollywood music room — private library, two-person Jam |
| [`sites/onlyforyou`](sites/onlyforyou/) | A second private music room with the same private-library + Jam system |

Both sites share the **private music platform**: invite-only Supabase auth,
a per-user track library backed by Cloudflare R2 (browser→R2 uploads,
short-lived signed streaming URLs), full Media Session lock-screen controls,
and a synchronized two-person **Jam** room (shared timeline, drift
correction, shared queue, chat & reactions, per-device sleep timer).

**Guides:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) ·
[`docs/ADMIN-GUIDE.md`](docs/ADMIN-GUIDE.md) (uploading songs, inviting
friends) · [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) (security posture,
Android limitations, device test matrix).

---

## Local Development

```bash
cd sites/adhurekisse      # or sites/onlyforyou (port 3001)
npm install
npm run dev               # http://localhost:3000
```

Optional private-library/Jam services run from `.env.local` (see
`docs/DEPLOYMENT.md`); without them the sites still play the YouTube library.

```bash
npm run typecheck         # tsc --noEmit
npm test                  # vitest unit tests (no services needed)
npm run test:e2e          # playwright (needs E2E_* env vars + seeded stack)
```

---

## Production Build

```bash
cd sites/adhurekisse
npm install
npm run build
npm run start
```

---

## Deploying to Vercel

1. Connect your GitHub repository to Vercel.
2. When creating the project, set **Root Directory** to `sites/adhurekisse`.
3. Framework: **Next.js** (auto-detected).
4. Add the environment variables from [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
   (optional — the site stays open-access without them).
5. Click **Deploy**.

Future sites (e.g. `sites/midnightdrive`) are deployed the same way as separate Vercel projects — each with their own Root Directory.

---

## Adding a New Site

See [`sites/adhurekisse/CREATING-A-NEW-SITE.md`](sites/adhurekisse/CREATING-A-NEW-SITE.md) for step-by-step instructions.

---

## Repository Structure

```
TunesGallery/
├── README.md
├── .gitignore
└── sites/
    ├── adhurekisse/          ← standalone Next.js app
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   └── globals.css
    │   ├── components/
    │   │   ├── MusicRoom.tsx
    │   │   ├── Record.tsx
    │   │   ├── PlayerControls.tsx
    │   │   ├── SongInfo.tsx
    │   │   ├── Library.tsx
    │   │   ├── SearchBox.tsx
    │   │   └── AmbientBackground.tsx
    │   ├── data/
    │   │   ├── site.ts       ← site name, theme, SEO config
    │   │   └── songs.ts      ← song list (replace with final 50)
    │   ├── lib/
    │   │   ├── useAudioEngine.ts
    │   │   └── utils.ts
    │   ├── public/
    │   │   ├── covers/       ← song artwork (jpg/webp)
    │   │   └── audio/        ← audio files (mp3)
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── next.config.ts
    └── [future-sites]/
```
