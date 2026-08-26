# TunesGallery

> A multi-site, data-driven music archive monorepo.

Each website lives independently inside `sites/<site-name>/` and is deployed as its own Vercel project by setting that folder as the **Root Directory**.

---

## Sites

| Site | Description |
|------|-------------|
| [`sites/adhurekisse`](sites/adhurekisse/) | The first site — an immersive late-night Bollywood music room |

---

## Local Development

```bash
cd sites/adhurekisse
npm install
npm run dev
```

Open **http://localhost:3000**

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
4. No environment variables required for V1.
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
