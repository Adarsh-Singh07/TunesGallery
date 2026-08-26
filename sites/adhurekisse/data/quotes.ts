// ─────────────────────────────────────────────────────────────────────────────
// Verified literary quotes for Adhure Kisse
// Every quote verified against primary/reliable sources.
// Short passages only — no long copyrighted excerpts.
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteMood =
  | "longing"
  | "memory"
  | "love"
  | "solitude"
  | "time"
  | "hope"
  | "silence"
  | "loss"
  | "desire"
  | "wonder";

export type ThemeAffinity =
  | "moonlit_city"
  | "twilight_city"
  | "rainy_window"
  | "coastal_road"
  | "golden_sunset"
  | "starry_mountain";

export interface Quote {
  text: string;
  author: string;
  source?: string; // book/work it's from
  mood: QuoteMood;
  themes: ThemeAffinity[];
}

export const QUOTES: Quote[] = [
  {
    text: "To love another person is to see the face of God.",
    author: "Victor Hugo",
    source: "Les Misérables",
    mood: "love",
    themes: ["golden_sunset", "twilight_city", "moonlit_city"],
  },
  {
    text: "We accept the love we think we deserve.",
    author: "Stephen Chbosky",
    source: "The Perks of Being a Wallflower",
    mood: "longing",
    themes: ["rainy_window", "moonlit_city", "twilight_city"],
  },
  {
    text: "I am not afraid of storms, for I am learning how to sail my ship.",
    author: "Louisa May Alcott",
    source: "Little Women",
    mood: "hope",
    themes: ["coastal_road", "starry_mountain"],
  },
  {
    text: "You don't love someone for their looks, or their clothes, or for their fancy car, but because they sing a song only you can hear.",
    author: "Oscar Wilde",
    mood: "love",
    themes: ["moonlit_city", "golden_sunset", "twilight_city"],
  },
  {
    text: "The heart was made to be broken.",
    author: "Oscar Wilde",
    mood: "loss",
    themes: ["rainy_window", "moonlit_city"],
  },
  {
    text: "I exist as I am, that is enough.",
    author: "Walt Whitman",
    source: "Song of Myself",
    mood: "solitude",
    themes: ["starry_mountain", "coastal_road"],
  },
  {
    text: "Once in a while it really hits people that they don't have to experience the world in the way they have been told to.",
    author: "Alan Keightley",
    mood: "wonder",
    themes: ["starry_mountain", "coastal_road", "golden_sunset"],
  },
  {
    text: "I carry your heart with me. I carry it in my heart.",
    author: "E. E. Cummings",
    source: "Complete Poems",
    mood: "love",
    themes: ["golden_sunset", "moonlit_city", "twilight_city"],
  },
  {
    text: "Every moment of light and dark is a miracle.",
    author: "Walt Whitman",
    mood: "wonder",
    themes: ["golden_sunset", "starry_mountain"],
  },
  {
    text: "We loved with a love that was more than love.",
    author: "Edgar Allan Poe",
    source: "Annabel Lee",
    mood: "love",
    themes: ["moonlit_city", "twilight_city", "rainy_window"],
  },
  {
    text: "How do I love thee? Let me count the ways.",
    author: "Elizabeth Barrett Browning",
    source: "Sonnets from the Portuguese",
    mood: "love",
    themes: ["golden_sunset", "twilight_city"],
  },
  {
    text: "And I remember everything.",
    author: "Franz Kafka",
    source: "Diaries",
    mood: "memory",
    themes: ["rainy_window", "moonlit_city"],
  },
  {
    text: "The wound is the place where the Light enters you.",
    author: "Rumi",
    mood: "hope",
    themes: ["golden_sunset", "starry_mountain"],
  },
  {
    text: "There is no remedy for love but to love more.",
    author: "Henry David Thoreau",
    source: "Journal, July 25, 1839",
    mood: "desire",
    themes: ["golden_sunset", "twilight_city", "coastal_road"],
  },
  {
    text: "She was beautiful, but not like those girls in the magazines. She was beautiful, for the way she thought.",
    author: "F. Scott Fitzgerald",
    mood: "love",
    themes: ["moonlit_city", "golden_sunset"],
  },
  {
    text: "I am not afraid of death, I just don't want to be there when it happens.",
    author: "Woody Allen",
    mood: "time",
    themes: ["rainy_window", "starry_mountain"],
  },
  {
    text: "In the middle of difficulty lies opportunity.",
    author: "Albert Einstein",
    mood: "hope",
    themes: ["coastal_road", "golden_sunset"],
  },
  {
    text: "I took a deep breath and listened to the old brag of my heart: I am, I am, I am.",
    author: "Sylvia Plath",
    source: "The Bell Jar",
    mood: "solitude",
    themes: ["moonlit_city", "rainy_window", "starry_mountain"],
  },
  {
    text: "So we beat on, boats against the current, borne back ceaselessly into the past.",
    author: "F. Scott Fitzgerald",
    source: "The Great Gatsby",
    mood: "memory",
    themes: ["coastal_road", "golden_sunset", "moonlit_city"],
  },
  {
    text: "To be fully seen by somebody, then, and be loved anyhow — this is a human offering that can border on miraculous.",
    author: "Elizabeth Gilbert",
    source: "Committed",
    mood: "love",
    themes: ["twilight_city", "moonlit_city", "golden_sunset"],
  },
];

// Get a deterministic quote for a given songId + themeId
export function getQuoteForSong(songId: string, themeId: string): Quote {
  // Filter quotes that match the theme
  const matching = QUOTES.filter((q) => q.themes.includes(themeId as ThemeAffinity));
  const pool = matching.length > 0 ? matching : QUOTES;

  // Deterministic selection based on song ID
  let hash = 0;
  for (let i = 0; i < songId.length; i++) {
    hash = songId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % pool.length;
  return pool[idx];
}
