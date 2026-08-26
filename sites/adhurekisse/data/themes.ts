// ─────────────────────────────────────────────────────────────────────────────
// Six cinematic themes for Adhure Kisse
// Each theme adapts: background, text, accent, overlay, gradient direction
// ─────────────────────────────────────────────────────────────────────────────

export type ThemeId =
  | "moonlit_city"
  | "twilight_city"
  | "rainy_window"
  | "coastal_road"
  | "golden_sunset"
  | "starry_mountain";

export interface CinematicTheme {
  id: ThemeId;
  label: string;
  bgUrl: string;
  // CSS custom property values applied via data-theme
  primary: string;       // main text
  secondary: string;     // song title
  accent: string;        // highlights, active state
  accentSoft: string;    // accent at low opacity
  muted: string;         // labels, eyebrows
  quoteColor: string;    // literary quote text
  border: string;        // subtle borders
  surface: string;       // card/button bg
  surfaceHover: string;
  shadow: string;
  // Overlay
  overlayTop: string;    // top gradient stop (low opacity)
  overlayBottom: string; // bottom gradient stop (higher opacity)
  vignetteColor: string;
  // Gradient direction for mood
  gradientAngle: string;
}

export const THEMES: Record<ThemeId, CinematicTheme> = {
  moonlit_city: {
    id: "moonlit_city",
    label: "Moon City",
    bgUrl: "/backgrounds/bg_moonlit_city.jpg",
    primary: "#e8e4f2",
    secondary: "#c8c0e0",
    accent: "#a090d0",
    accentSoft: "rgba(160, 144, 208, 0.14)",
    muted: "#8078a0",
    quoteColor: "#b0a8c8",
    border: "rgba(200, 192, 240, 0.12)",
    surface: "rgba(160, 144, 208, 0.06)",
    surfaceHover: "rgba(160, 144, 208, 0.10)",
    shadow: "rgba(10, 8, 20, 0.80)",
    overlayTop: "rgba(10, 8, 20, 0.08)",
    overlayBottom: "rgba(10, 8, 20, 0.60)",
    vignetteColor: "rgba(10, 8, 20, 0.45)",
    gradientAngle: "180deg",
  },
  twilight_city: {
    id: "twilight_city",
    label: "Twilight",
    bgUrl: "/backgrounds/bg_twilight_city.jpg",
    primary: "#f0e4f4",
    secondary: "#d4b8e8",
    accent: "#b880d8",
    accentSoft: "rgba(184, 128, 216, 0.14)",
    muted: "#9068a8",
    quoteColor: "#c0a0d4",
    border: "rgba(220, 190, 255, 0.12)",
    surface: "rgba(184, 128, 216, 0.06)",
    surfaceHover: "rgba(184, 128, 216, 0.10)",
    shadow: "rgba(18, 8, 28, 0.80)",
    overlayTop: "rgba(18, 8, 28, 0.08)",
    overlayBottom: "rgba(18, 8, 28, 0.58)",
    vignetteColor: "rgba(18, 8, 28, 0.45)",
    gradientAngle: "160deg",
  },
  rainy_window: {
    id: "rainy_window",
    label: "Rainy Night",
    bgUrl: "/backgrounds/bg_rainy_window.jpg",
    primary: "#dce8f0",
    secondary: "#a8c0d0",
    accent: "#6090b8",
    accentSoft: "rgba(96, 144, 184, 0.14)",
    muted: "#607080",
    quoteColor: "#90aabf",
    border: "rgba(180, 210, 240, 0.10)",
    surface: "rgba(96, 144, 184, 0.06)",
    surfaceHover: "rgba(96, 144, 184, 0.10)",
    shadow: "rgba(8, 14, 20, 0.80)",
    overlayTop: "rgba(8, 14, 20, 0.10)",
    overlayBottom: "rgba(8, 14, 20, 0.62)",
    vignetteColor: "rgba(8, 14, 20, 0.48)",
    gradientAngle: "180deg",
  },
  coastal_road: {
    id: "coastal_road",
    label: "Coastal Road",
    bgUrl: "/backgrounds/bg_coastal_road.jpg",
    primary: "#e0eeec",
    secondary: "#a0c0bc",
    accent: "rgb(64, 160, 148)",
    accentSoft: "rgba(64, 160, 148, 0.14)",
    muted: "rgb(72, 104, 100)",
    quoteColor: "#90b4b0",
    border: "rgba(160, 210, 200, 0.10)",
    surface: "rgba(64, 160, 148, 0.06)",
    surfaceHover: "rgba(64, 160, 148, 0.10)",
    shadow: "rgba(8, 18, 16, 0.80)",
    overlayTop: "rgba(8, 18, 16, 0.08)",
    overlayBottom: "rgba(8, 18, 16, 0.58)",
    vignetteColor: "rgba(8, 18, 16, 0.42)",
    gradientAngle: "170deg",
  },
  golden_sunset: {
    id: "golden_sunset",
    label: "Golden Sunset",
    bgUrl: "/backgrounds/bg_golden_sunset.jpg",
    primary: "#f4ead8",
    secondary: "#dcc090",
    accent: "#c08830",
    accentSoft: "rgba(192, 136, 48, 0.16)",
    muted: "#a07040",
    quoteColor: "#c8a868",
    border: "rgba(220, 190, 130, 0.12)",
    surface: "rgba(192, 136, 48, 0.07)",
    surfaceHover: "rgba(192, 136, 48, 0.12)",
    shadow: "rgba(20, 12, 4, 0.80)",
    overlayTop: "rgba(20, 12, 4, 0.06)",
    overlayBottom: "rgba(20, 12, 4, 0.55)",
    vignetteColor: "rgba(20, 12, 4, 0.40)",
    gradientAngle: "175deg",
  },
  starry_mountain: {
    id: "starry_mountain",
    label: "Starry Mountain",
    bgUrl: "/backgrounds/bg_starry_mountain.jpg",
    primary: "#e4e8f4",
    secondary: "#a8b4d0",
    accent: "#7090c0",
    accentSoft: "rgba(112, 144, 192, 0.14)",
    muted: "rgb(80, 96, 128)",
    quoteColor: "#9aaac8",
    border: "rgba(180, 200, 240, 0.10)",
    surface: "rgba(112, 144, 192, 0.06)",
    surfaceHover: "rgba(112, 144, 192, 0.10)",
    shadow: "rgba(6, 10, 20, 0.80)",
    overlayTop: "rgba(6, 10, 20, 0.10)",
    overlayBottom: "rgba(6, 10, 20, 0.62)",
    vignetteColor: "rgba(6, 10, 20, 0.48)",
    gradientAngle: "185deg",
  },
};

export const THEME_ORDER: ThemeId[] = [
  "moonlit_city",
  "twilight_city",
  "rainy_window",
  "coastal_road",
  "golden_sunset",
  "starry_mountain",
];

// Map song IDs deterministically to themes
const SONG_THEME_MAP: Record<string, ThemeId> = {
  "01": "moonlit_city",    // Soniye — late-night, romantic
  "02": "golden_sunset",   // Kabhi Aayine Pe Likha — nostalgic, warm
  "03": "coastal_road",    // Tu Jo Mila — journey, hope
  "04": "twilight_city",   // Sajde — devotion, purple dusk
  "05": "rainy_window",    // Kal Ki Hi Baat Hai — nostalgia, memory
  "06": "moonlit_city",    // Dilnashin Dilnashin — melancholic, night
  "07": "golden_sunset",   // I Am In Love — retro, warm
  "08": "twilight_city",   // Kya Mujhe Pyar Hai — ache, late-night purple
  "09": "rainy_window",    // Beete Lamhein — memory, rain
  "10": "golden_sunset",   // Mera Pehla Pehla Pyaar — first love, warm
  "11": "coastal_road",    // Labon Ko — romantic, open
  "12": "starry_mountain", // Ajab Si — wonder, stars
  "13": "coastal_road",    // Zindagi Do Pal Ki — life, sea
  "14": "moonlit_city",    // Dil Kyun Yeh Mera — longing, blue night
  "15": "starry_mountain", // Jaane Kiske Khwaab — dreams, mountain
};

export function getThemeForSong(songId: string): CinematicTheme {
  const themeId = SONG_THEME_MAP[songId];
  if (themeId && THEMES[themeId]) return THEMES[themeId];
  // Fallback: deterministic hash
  let hash = 0;
  for (let i = 0; i < songId.length; i++) {
    hash = songId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % THEME_ORDER.length;
  return THEMES[THEME_ORDER[idx]];
}
