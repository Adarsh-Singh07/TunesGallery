# Deploying adhurekisse to Vercel

## Prerequisites

- A [Vercel](https://vercel.com) account
- The `TunesGallery` repository on GitHub (or GitLab / Bitbucket)

---

## Steps

### 1. Import the repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select `TunesGallery`

### 2. Configure the project

| Setting | Value |
|---------|-------|
| **Root Directory** | `sites/adhurekisse` |
| **Framework Preset** | Next.js (auto-detected) |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |
| **Install Command** | `npm install` (default) |

> ⚠️ The **Root Directory** setting is critical. Without it, Vercel will look for `package.json` at the repo root and fail.

### 3. Environment Variables

None required for V1.

### 4. Deploy

Click **Deploy** and wait for the build to complete.

---

## Custom Domain

After deployment, go to the project **Settings → Domains** and add your custom domain.

---

## Deploying a Second Site

Create a **new Vercel project** (from the same GitHub repo), but set Root Directory to `sites/your-new-site`. Each site is an independent Vercel deployment.

---

## Continuous Deployment

Every push to the `main` branch triggers an automatic redeploy on Vercel.

To prevent one site's build failures from affecting another, each site is a completely separate Vercel project.
