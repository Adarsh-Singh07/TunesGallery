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
  bgUrlMobile?: string;
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
    bgUrlMobile: "/backgrounds/mobile_moon_city.jpg",
    primary: "#ffffff",
    secondary: "#f0f0f5",
    accent: "#bca4f4",
    accentSoft: "rgba(188, 164, 244, 0.15)",
    muted: "#a39db3",
    quoteColor: "#e0dce8",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "180deg",
  },
  twilight_city: {
    id: "twilight_city",
    label: "Twilight",
    bgUrl: "/backgrounds/bg_twilight_city.jpg",
    bgUrlMobile: "/backgrounds/mobile_twilight.jpg",
    primary: "#ffffff",
    secondary: "#f5f0f8",
    accent: "#d4a8f9",
    accentSoft: "rgba(212, 168, 249, 0.15)",
    muted: "#b3a3c2",
    quoteColor: "#e6dcf0",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "160deg",
  },
  rainy_window: {
    id: "rainy_window",
    label: "Rainy Night",
    bgUrl: "/backgrounds/bg_rainy_window.jpg",
    bgUrlMobile: "/backgrounds/mobile_rainy.jpg",
    primary: "#ffffff",
    secondary: "#f0f5f8",
    accent: "#a2cbf0",
    accentSoft: "rgba(162, 203, 240, 0.15)",
    muted: "#9ba8b5",
    quoteColor: "#d8e4ef",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "180deg",
  },
  coastal_road: {
    id: "coastal_road",
    label: "Coastal Road",
    bgUrl: "/backgrounds/bg_coastal_road.jpg",
    bgUrlMobile: "/backgrounds/mobile_coastal.jpg",
    primary: "#ffffff",
    secondary: "#f0f8f6",
    accent: "#8be0d4",
    accentSoft: "rgba(139, 224, 212, 0.15)",
    muted: "#a1b5b1",
    quoteColor: "#d6efeb",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "170deg",
  },
  golden_sunset: {
    id: "golden_sunset",
    label: "Golden Sunset",
    bgUrl: "/backgrounds/bg_golden_sunset.jpg",
    bgUrlMobile: "/backgrounds/mobile_golden.jpg",
    primary: "#ffffff",
    secondary: "#fdf8f0",
    accent: "#f9c878",
    accentSoft: "rgba(249, 200, 120, 0.15)",
    muted: "#c2ae95",
    quoteColor: "#f0e6d5",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "175deg",
  },
  starry_mountain: {
    id: "starry_mountain",
    label: "Starry Mountain",
    bgUrl: "/backgrounds/bg_starry_mountain.jpg",
    bgUrlMobile: "/backgrounds/mobile_starry.jpg",
    primary: "#ffffff",
    secondary: "#f0f4f9",
    accent: "#a8c6f4",
    accentSoft: "rgba(168, 198, 244, 0.15)",
    muted: "#9facbd",
    quoteColor: "#d9e2ef",
    border: "rgba(255, 255, 255, 0.15)",
    surface: "rgba(255, 255, 255, 0.08)",
    surfaceHover: "rgba(255, 255, 255, 0.12)",
    shadow: "rgba(0, 0, 0, 0.90)",
    overlayTop: "rgba(0, 0, 0, 0.50)",
    overlayBottom: "rgba(0, 0, 0, 0.95)",
    vignetteColor: "rgba(0, 0, 0, 0.75)",
    gradientAngle: "185deg",
  }
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
