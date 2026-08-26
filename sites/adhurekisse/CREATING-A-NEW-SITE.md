# Creating a New Site

The TunesGallery monorepo makes it trivial to spin up a completely different music website using the same architecture.

---

## Steps

### 1. Duplicate the site folder

```bash
# From the repository root
cp -r sites/adhurekisse sites/your-new-site
```

Or on Windows:

```powershell
Copy-Item -Recurse sites\adhurekisse sites\your-new-site
```

---

### 2. Update the site configuration

Edit `sites/your-new-site/data/site.ts`:

```ts
export const site: SiteConfig = {
  name: "your-new-site",
  eyebrow: "YOUR LABEL · A MUSIC ROOM",
  tagline: "Your tagline here.",
  description: "Your site description.",
  artistLabel: "The Artist",
  theme: {
    background: "#0a0808",
    foreground: "#f0ece5",
    muted: "#887f79",
    accent: "#d4956a",       // <- the brand colour
    accentSoft: "rgba(212, 149, 106, 0.12)",
    surface: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.10)",
  },
  seo: {
    title: "your-new-site — TunesGallery",
    description: "Your tagline here.",
    ogImage: "/og-image.jpg",
  },
  footer: {
    collectionLabel: "YOUR COLLECTION",
    mottoLine: "LISTEN · FEEL · RETURN",
  },
};
```

---

### 3. Replace the song list

Edit `sites/your-new-site/data/songs.ts` with your songs:

```ts
export const songs: Song[] = [
  {
    id: "01",
    title: "Song Name",
    artist: "Artist",
    movie: "Movie Name",
    year: "2005",
    cover: "/covers/01.webp",
    audio: "/audio/01.mp3",
    accent: "#b08060",
    tags: ["tag1", "tag2"],
  },
  // ... up to 50 or more songs
];
```

---

### 4. Replace artwork

Drop cover images (`.jpg` or `.webp`, square, ≥ 600×600) into:

```
sites/your-new-site/public/covers/
```

The filename should match the `cover` field in `songs.ts` (e.g. `01.webp`).

---

### 5. Add audio files

Drop MP3 files (authorized for use) into:

```
sites/your-new-site/public/audio/
```

The filename should match the `audio` field in `songs.ts` (e.g. `01.mp3`).

> **Important**: Only use audio files you are legally authorized to distribute. The application does not download or scrape any audio automatically.

---

### 6. Add a social preview image

Replace `sites/your-new-site/public/og-image.jpg` with your own branded social card (1200×630 recommended).

---

### 7. (Optional) Customize the CSS theme

All colors are CSS variables in `app/globals.css`. They read from the values in `data/site.ts` via the layout. To deeply customize typography or spacing, edit the `:root` block in `globals.css`.

---

### 8. Test locally

```bash
cd sites/your-new-site
npm install
npm run dev
```

Open http://localhost:3000 and verify everything looks correct.

---

### 9. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and create a **new project**.
2. Import the same GitHub repository (`TunesGallery`).
3. Set **Root Directory** to `sites/your-new-site`.
4. Framework: **Next.js** (auto-detected).
5. No environment variables needed.
6. Click **Deploy**.

Each site gets its own Vercel URL and can have its own custom domain.

---

## What You Don't Need to Change

- `components/` — all UI components are data-driven
- `lib/` — audio engine and utilities are generic
- `app/layout.tsx` — reads from `data/site.ts`
- `app/page.tsx` — unchanged
- `next.config.ts` — unchanged
- `package.json` — unchanged (unless you add new dependencies)
