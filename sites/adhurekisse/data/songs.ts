import type { PlaybackReference } from "../lib/playback/types";

export type { PlaybackReference };

export type Song = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  movie?: string;
  year?: string;
  artwork?: {
    poster?: string;
    cover?: string;
  };
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
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b",
    },
    accent: "#c9a560",
    tags: ["romantic", "late-night"],
    playback: {
      youtubeId: "B6T0qtasUzQ",
      spotifyTrackId: "7n56JgxCsWXr8om8KCzqNz"
    },
  },
  {
    id: "02",
    title: "Kabhi Aayine Pe Likha",
    artist: "K.K.",
    year: "2000",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02467cc511d190809571295e3f",
    },
    accent: "#a87b55",
    tags: ["nostalgia", "classic"],
    playback: {
      youtubeId: "9BWNft9Z4qo",
      spotifyTrackId: "739IveImaxOatSzo2ZeKQA"
    },
  },
  {
    id: "03",
    title: "Tu Jo Mila",
    artist: "K.K.",
    movie: "Bajrangi Bhaijaan",
    year: "2015",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b",
    },
    accent: "#8fa8b2",
    tags: ["emotional", "journey"],
    playback: {
      youtubeId: "6DCOjq0omBc",
      spotifyTrackId: "0Gx85FNdpsYyTfHiumSJfk"
    },
  },
  {
    id: "04",
    title: "Sajde",
    artist: "K.K.",
    movie: "Khatta Meetha",
    year: "2010",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0241fe7fefda3f9e00eaa3176d",
    },
    accent: "#b08060",
    tags: ["devotion", "late-night"],
    playback: {
      youtubeId: "OfF_nuC6wl0",
      spotifyTrackId: "31sTzv9mfBCZl9YvRqvdC7"
    },
  },
  {
    id: "05",
    title: "Kal Ki Hi Baat Hai",
    artist: "K.K.",
    year: "2003",
    artwork: {
      cover: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02001d88b725d5b03265b29a22",
    },
    accent: "#7a8fa0",
    tags: ["nostalgia", "memories"],
    playback: {
      youtubeId: "JeGBNhyJeE4",
      spotifyTrackId: "11GEy9X09xBXMWc1VUgGSi"
    },
  },
  {
    id: "06",
    title: "Dilnashin Dilnashin",
    artist: "K.K.",
    year: "2006",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa",
    },
    accent: "#a06860",
    tags: ["melancholic", "classic"],
    playback: {
      youtubeId: "v_L-bAB1kUA",
      spotifyTrackId: "5YkdZYZvkbZg2us6csL9WB"
    },
  },
  {
    id: "07",
    title: "I Am In Love",
    artist: "K.K.",
    movie: "Once Upon a Time in Mumbaai",
    year: "2010",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b",
    },
    accent: "#c08050",
    tags: ["romantic", "retro"],
    playback: {
      youtubeId: "BDQG49CgQL4",
      spotifyTrackId: "111KDx9Y9OMRTynJ4WYXSo"
    },
  },
  {
    id: "08",
    title: "Kya Mujhe Pyar Hai",
    artist: "K.K.",
    movie: "Woh Lamhe",
    year: "2006",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa",
    },
    accent: "#8080a8",
    tags: ["ache", "late-night"],
    playback: {
      youtubeId: "lrAM_H7v8wM",
      spotifyTrackId: "5d8fPSMf8DJiz1beVdmk6P"
    },
  },
  {
    id: "09",
    title: "Beete Lamhein",
    artist: "K.K.",
    movie: "The Train",
    year: "2007",
    artwork: {
      cover: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0251d1cd8d46cbcd8fd4508356",
    },
    accent: "#9070a0",
    tags: ["nostalgia", "memories"],
    playback: {
      youtubeId: "2d4I1xW2sNk",
      spotifyTrackId: "0zQa7QXLpUZfrrsWbgDZll"
    },
  },
  {
    id: "10",
    title: "Mera Pehla Pehla Pyaar",
    artist: "K.K.",
    year: "2007",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e024176ceceaf43dba8a41176a2",
    },
    accent: "#c09060",
    tags: ["first-love", "sweet"],
    playback: {
      youtubeId: "k7fPoKUXaWM",
      spotifyTrackId: "6fOrdTNuSAM219wGYwZMaO"
    },
  },
  {
    id: "11",
    title: "Labon Ko",
    artist: "K.K.",
    movie: "Bhool Bhulaiyaa",
    year: "2007",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa",
    },
    accent: "#a87850",
    tags: ["romantic", "classic"],
    playback: {
      youtubeId: "ri3NctAmkWE",
      spotifyTrackId: "29emMq4nAyWh9BWgfppyOd"
    },
  },
  {
    id: "12",
    title: "Ajab Si",
    artist: "K.K.",
    movie: "Om Shanti Om",
    year: "2007",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02675b3f7dea80153c73581e5e",
    },
    accent: "#b09060",
    tags: ["wonder", "romantic"],
    playback: {
      youtubeId: "2drIKUOCZxU",
      spotifyTrackId: "5FXMRdJjKq1BIX4e8Eg9mK"
    },
  },
  {
    id: "13",
    title: "Zindagi Do Pal Ki",
    artist: "K.K.",
    movie: "Kites",
    year: "2010",
    artwork: {
      cover: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa",
    },
    accent: "#70a8a0",
    tags: ["life", "poetic"],
    playback: {
      youtubeId: "r-XG86T2jNc",
      spotifyTrackId: "29kwMwn3NpHxNGHFAIT7yo"
    },
  },
  {
    id: "14",
    title: "Dil Kyun Yeh Mera",
    artist: "K.K.",
    movie: "Kites",
    year: "2010",
    artwork: {
      cover: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ae319e2da9a2e81dfe888409",
    },
    accent: "#6878a8",
    tags: ["longing", "late-night"],
    playback: {
      youtubeId: "M51OYEo2yjc",
      spotifyTrackId: "5nHwX7e5XHnie22nuTFgda"
    },
  },
  {
    id: "15",
    title: "Jaane Kiske Khwaab",
    artist: "K.K.",
    year: "2004",
    artwork: {
      cover: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b",
    },
    accent: "#a08860",
    tags: ["dreams", "classic"],
    playback: {
      youtubeId: "uq_kkYsHEK0",
      spotifyTrackId: "20fpyOCePmpwouyfVQKxBY"
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────
// HOW TO ADD THE FINAL 50 SONGS
// ──────────────────────────────────────────────────────────────────────────
//
// 1. Replace the entries above with the final song list.
// 2. For each song, populate playback.youtubeId and/or playback.spotifyTrackId:
//
//      playback: {
//        youtubeId: "dQw4w9WgXcQ",         // 11-char YouTube video ID
//        spotifyTrackId: "4iV5W9uYEdYUVa79Axb7Rh"  // Spotify track ID
//      }
//
// 3. Optionally add a cover image at public/covers/<id>.webp
//    and reference it: cover: "/covers/01.webp"
//
// 4. No audio files are needed in the repository.
//    YouTube and Spotify handle all audio delivery.
// ──────────────────────────────────────────────────────────────────────────
