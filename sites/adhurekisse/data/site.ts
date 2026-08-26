export type SiteTheme = {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  accentSoft: string;
  surface: string;
  border: string;
};

export type SiteConfig = {
  name: string;
  eyebrow: string;
  tagline: string;
  description: string;
  artistLabel: string;
  theme: SiteTheme;
  seo: {
    title: string;
    description: string;
    ogImage?: string;
  };
  footer: {
    collectionLabel: string;
    mottoLine: string;
  };
};

export const site: SiteConfig = {
  name: "adhurekisse",
  eyebrow: "TUNES GALLERY · A PRIVATE MUSIC ROOM",
  tagline: "Some songs stay. Some stories remain.",
  description:
    "An immersive archive of music that lives between memory and sound.",
  artistLabel: "K.K.",
  theme: {
    background: "#090807",
    foreground: "#ede8df",
    muted: "#8c8680",
    accent: "#c9a560",
    accentSoft: "rgba(201,165,96,0.12)",
    surface: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.10)",
  },
  seo: {
    title: "adhurekisse — TunesGallery",
    description: "Some songs stay. Some stories remain.",
    ogImage: "/og-image.jpg",
  },
  footer: {
    collectionLabel: "EVERGREEN COLLECTION",
    mottoLine: "LISTEN · REMEMBER · RETURN",
  },
};
