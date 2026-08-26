import json

old_songs = [
  {
    "id": "01",
    "title": "Soniye",
    "artist": "K.K.",
    "movie": "Heartless",
    "year": "2014",
    "accent": "#c9a560",
    "tags": ["romantic", "late-night"]
  },
  {
    "id": "02",
    "title": "Kabhi Aayine Pe Likha",
    "artist": "K.K.",
    "year": "2000",
    "accent": "#a87b55",
    "tags": ["nostalgia", "classic"]
  },
  {
    "id": "03",
    "title": "Tu Jo Mila",
    "artist": "K.K.",
    "movie": "Bajrangi Bhaijaan",
    "year": "2015",
    "accent": "#8fa8b2",
    "tags": ["emotional", "journey"]
  },
  {
    "id": "04",
    "title": "Sajde",
    "artist": "K.K.",
    "movie": "Khatta Meetha",
    "year": "2010",
    "accent": "#b08060",
    "tags": ["devotion", "late-night"]
  },
  {
    "id": "05",
    "title": "Kal Ki Hi Baat Hai",
    "artist": "K.K.",
    "year": "2003",
    "accent": "#7a8fa0",
    "tags": ["nostalgia", "memories"]
  },
  {
    "id": "06",
    "title": "Dilnashin Dilnashin",
    "artist": "K.K.",
    "year": "2006",
    "accent": "#a06860",
    "tags": ["melancholic", "classic"]
  },
  {
    "id": "07",
    "title": "I Am In Love",
    "artist": "K.K.",
    "movie": "Once Upon a Time in Mumbaai",
    "year": "2010",
    "accent": "#c08050",
    "tags": ["romantic", "retro"]
  },
  {
    "id": "08",
    "title": "Kya Mujhe Pyar Hai",
    "artist": "K.K.",
    "movie": "Woh Lamhe",
    "year": "2006",
    "accent": "#8080a8",
    "tags": ["ache", "late-night"]
  },
  {
    "id": "09",
    "title": "Beete Lamhein",
    "artist": "K.K.",
    "movie": "The Train",
    "year": "2007",
    "accent": "#9070a0",
    "tags": ["nostalgia", "memories"]
  },
  {
    "id": "10",
    "title": "Mera Pehla Pehla Pyaar",
    "artist": "K.K.",
    "year": "2007",
    "accent": "#c09060",
    "tags": ["first-love", "sweet"]
  },
  {
    "id": "11",
    "title": "Labon Ko",
    "artist": "K.K.",
    "movie": "Bhool Bhulaiyaa",
    "year": "2007",
    "accent": "#a87850",
    "tags": ["romantic", "classic"]
  },
  {
    "id": "12",
    "title": "Ajab Si",
    "artist": "K.K.",
    "movie": "Om Shanti Om",
    "year": "2007",
    "accent": "#b09060",
    "tags": ["wonder", "romantic"]
  },
  {
    "id": "13",
    "title": "Zindagi Do Pal Ki",
    "artist": "K.K.",
    "movie": "Kites",
    "year": "2010",
    "accent": "#70a8a0",
    "tags": ["life", "poetic"]
  },
  {
    "id": "14",
    "title": "Dil Kyun Yeh Mera",
    "artist": "K.K.",
    "movie": "Kites",
    "year": "2010",
    "accent": "#6878a8",
    "tags": ["longing", "late-night"]
  },
  {
    "id": "15",
    "title": "Jaane Kiske Khwaab",
    "artist": "K.K.",
    "year": "2004",
    "accent": "#a08860",
    "tags": ["dreams", "classic"]
  }
]

yt_ids = [
    "B6T0qtasUzQ", "9BWNft9Z4qo", "6DCOjq0omBc", "OfF_nuC6wl0",
    "JeGBNhyJeE4", "v_L-bAB1kUA", "BDQG49CgQL4", "lrAM_H7v8wM",
    "2d4I1xW2sNk", "k7fPoKUXaWM", "ri3NctAmkWE", "2drIKUOCZxU",
    "r-XG86T2jNc", "M51OYEo2yjc", "uq_kkYsHEK0"
]

spotify_data = [
  { "title": "Soniye", "track_id": "7n56JgxCsWXr8om8KCzqNz", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b" },
  { "title": "Kabhi Aayine Pe Likha", "track_id": "739IveImaxOatSzo2ZeKQA", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02467cc511d190809571295e3f" },
  { "title": "Tu Jo Mila", "track_id": "0Gx85FNdpsYyTfHiumSJfk", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b" },
  { "title": "Sajde", "track_id": "31sTzv9mfBCZl9YvRqvdC7", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e0241fe7fefda3f9e00eaa3176d" },
  { "title": "Kal Ki Hi Baat Hai", "track_id": "11GEy9X09xBXMWc1VUgGSi", "cover_url": "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02001d88b725d5b03265b29a22" },
  { "title": "Dilnashin Dilnashin", "track_id": "5YkdZYZvkbZg2us6csL9WB", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa" },
  { "title": "I Am In Love", "track_id": "111KDx9Y9OMRTynJ4WYXSo", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b" },
  { "title": "Kya Mujhe Pyar Hai", "track_id": "5d8fPSMf8DJiz1beVdmk6P", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa" },
  { "title": "Beete Lamhein", "track_id": "0zQa7QXLpUZfrrsWbgDZll", "cover_url": "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0251d1cd8d46cbcd8fd4508356" },
  { "title": "Mera Pehla Pehla Pyaar", "track_id": "6fOrdTNuSAM219wGYwZMaO", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e024176ceceaf43dba8a41176a2" },
  { "title": "Labon Ko", "track_id": "29emMq4nAyWh9BWgfppyOd", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa" },
  { "title": "Ajab Si", "track_id": "5FXMRdJjKq1BIX4e8Eg9mK", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02675b3f7dea80153c73581e5e" },
  { "title": "Zindagi Do Pal Ki", "track_id": "29kwMwn3NpHxNGHFAIT7yo", "cover_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02456e0af8e834546541a00efa" },
  { "title": "Dil Kyun Yeh Mera", "track_id": "5nHwX7e5XHnie22nuTFgda", "cover_url": "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02ae319e2da9a2e81dfe888409" },
  { "title": "Jaane Kiske Khwaab", "track_id": "20fpyOCePmpwouyfVQKxBY", "cover_url": "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02f8ef6c7a66a030647287e25b" }
]

def format_song(s, yt, spot):
    lines = []
    lines.append('  {')
    lines.append(f'    id: "{s["id"]}",')
    lines.append(f'    title: "{s["title"]}",')
    lines.append(f'    artist: "{s["artist"]}",')
    if "movie" in s: lines.append(f'    movie: "{s["movie"]}",')
    if "year" in s: lines.append(f'    year: "{s["year"]}",')
    
    # artwork
    lines.append('    artwork: {')
    lines.append(f'      cover: "{spot["cover_url"]}",')
    lines.append('    },')
    
    lines.append(f'    accent: "{s["accent"]}",')
    lines.append(f'    tags: {json.dumps(s["tags"])},')
    
    # playback
    lines.append('    playback: {')
    lines.append(f'      youtubeId: "{yt}",')
    lines.append(f'      spotifyTrackId: "{spot["track_id"]}"')
    lines.append('    },')
    lines.append('  },')
    return "\n".join(lines)


header = '''import type { PlaybackReference } from "../lib/playback/types";

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
'''

footer = '''];

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
'''

content = header
for i in range(15):
    content += format_song(old_songs[i], yt_ids[i], spotify_data[i]) + "\n"
content += footer

with open('data/songs.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
