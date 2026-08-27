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
  name: "OnlyForYou",
  eyebrow: "A PRIVATE MUSIC ROOM · MADE WITH LOVE",
  tagline: "Every song here was chosen for you.",
  description:
    "A quiet corner of music, built for someone who deserves their own playlist.",
  theme: {
    background: "#07050a",
    foreground: "#f5ead8",
    muted: "#9c7b7b",
    accent: "#c4736a",
    accentSoft: "rgba(196,115,106,0.14)",
    surface: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.09)",
  },
  seo: {
    title: "OnlyForYou — A Private Music Room",
    description: "Every song here was chosen for you.",
    ogImage: "/og-image.jpg",
  },
  footer: {
    collectionLabel: "A CURATED COLLECTION",
    mottoLine: "LISTEN · FEEL · REMEMBER",
  },
};
