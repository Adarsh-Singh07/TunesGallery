import type { PlaybackReference } from "../lib/playback/types";

export type { PlaybackReference };

export type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  movie?: string;
  year?: string;
  cover?: string;
  accent?: string;
  tags?: string[];
  lyrics?: string;
  credits?: string;
  /** Provider-specific playback references. The UI reads these; providers consume them. */
  playback?: PlaybackReference;
};

export const songs: Song[] = [
  {
    id: "01",
    title: "Soniye",
    artist: "K.K.",
    movie: "Heartless",
    year: "2014",
    accent: "#c9a560",
    tags: ["romantic", "late-night"],
    playback: { youtubeId: "TTUxwWyClT0", spotifyTrackId: "" },
  },
  {
    id: "02",
    title: "Kabhi Aayine Pe Likha",
    artist: "K.K.",
    year: "2000",
    accent: "#a87b55",
    tags: ["nostalgia", "classic"],
    playback: { youtubeId: "9BWNft9Z4qo", spotifyTrackId: "" },
  },
  {
    id: "03",
    title: "Tu Jo Mila",
    artist: "K.K.",
    movie: "Bajrangi Bhaijaan",
    year: "2015",
    accent: "#8fa8b2",
    tags: ["emotional", "journey"],
    playback: { youtubeId: "6DCOjq0omBc", spotifyTrackId: "" },
  },
  {
    id: "04",
    title: "Sajde",
    artist: "K.K.",
    movie: "Khatta Meetha",
    year: "2010",
    accent: "#b08060",
    tags: ["devotion", "late-night"],
    playback: { youtubeId: "OfF_nuC6wl0", spotifyTrackId: "" },
  },
  {
    id: "05",
    title: "Kal Ki Hi Baat Hai",
    artist: "K.K.",
    year: "2003",
    accent: "#7a8fa0",
    tags: ["nostalgia", "memories"],
    playback: { youtubeId: "JeGBNhyJeE4", spotifyTrackId: "" },
  },
  {
    id: "06",
    title: "Dilnashin Dilnashin",
    artist: "K.K.",
    year: "2006",
    accent: "#a06860",
    tags: ["melancholic", "classic"],
    playback: { youtubeId: "v_L-bAB1kUA", spotifyTrackId: "" },
  },
  {
    id: "07",
    title: "I Am In Love",
    artist: "K.K.",
    movie: "Once Upon a Time in Mumbaai",
    year: "2010",
    accent: "#c08050",
    tags: ["romantic", "retro"],
    playback: { youtubeId: "DMLrGfMxOQA", spotifyTrackId: "" },
  },
  {
    id: "08",
    title: "Kya Mujhe Pyar Hai",
    artist: "K.K.",
    movie: "Woh Lamhe",
    year: "2006",
    accent: "#8080a8",
    tags: ["ache", "late-night"],
    playback: { youtubeId: "Gg6NMU4ivXM", spotifyTrackId: "" },
  },
  {
    id: "09",
    title: "Beete Lamhein",
    artist: "K.K.",
    movie: "The Train",
    year: "2007",
    accent: "#9070a0",
    tags: ["nostalgia", "memories"],
    playback: { youtubeId: "UlacMvx_VYk", spotifyTrackId: "" },
  },
  {
    id: "10",
    title: "Mera Pehla Pehla Pyaar",
    artist: "K.K.",
    year: "2007",
    accent: "#c09060",
    tags: ["first-love", "sweet"],
    playback: { youtubeId: "ykMRCIecWmw", spotifyTrackId: "" },
  },
  {
    id: "11",
    title: "Labon Ko",
    artist: "K.K.",
    movie: "Bhool Bhulaiyaa",
    year: "2007",
    accent: "#a87850",
    tags: ["romantic", "classic"],
    playback: { youtubeId: "-FP2Cmc7zj4", spotifyTrackId: "" },
  },
  {
    id: "12",
    title: "Ajab Si",
    artist: "K.K.",
    movie: "Om Shanti Om",
    year: "2007",
    accent: "#b09060",
    tags: ["wonder", "romantic"],
    playback: { youtubeId: "XIM9reXaY-Q", spotifyTrackId: "" },
  },
  {
    id: "13",
    title: "Zindagi Do Pal Ki",
    artist: "K.K.",
    movie: "Kites",
    year: "2010",
    accent: "#70a8a0",
    tags: ["life", "poetic"],
    playback: { youtubeId: "DNnlhJYDBlY", spotifyTrackId: "" },
  },
  {
    id: "14",
    title: "Dil Kyun Yeh Mera",
    artist: "K.K.",
    movie: "Kites",
    year: "2010",
    accent: "#6878a8",
    tags: ["longing", "late-night"],
    playback: { youtubeId: "maKDIvUVkQo", spotifyTrackId: "" },
  },
  {
    id: "15",
    title: "Jaane Kiske Khwaab",
    artist: "K.K.",
    year: "2004",
    accent: "#a08860",
    tags: ["dreams", "classic"],
    playback: { youtubeId: "3CoCIOXHQwk", spotifyTrackId: "" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO ADD THE FINAL 50 SONGS
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. Replace the entries above with the final song list.
// 2. For each song, populate playback.youtubeId and/or playback.spotifyTrackId:
//
//      playback: {
//        youtubeId: "dQw4w9WgXcQ",         ← 11-char YouTube video ID
//        spotifyTrackId: "4iV5W9uYEdYUVa79Axb7Rh"  ← Spotify track ID
//      }
//
// 3. Optionally add a cover image at public/covers/<id>.webp
//    and reference it: cover: "/covers/01.webp"
//
// 4. No audio files are needed in the repository.
//    YouTube and Spotify handle all audio delivery.
// ─────────────────────────────────────────────────────────────────────────────
