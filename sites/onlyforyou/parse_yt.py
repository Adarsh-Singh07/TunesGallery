import json
import codecs
import re

# Read the PowerShell-generated UTF-16 file
with codecs.open('playlist.json', 'r', 'utf-16') as f:
    lines = [line.strip() for line in f.readlines() if line.strip()]

songs = []
for i, line in enumerate(lines):
    d = json.loads(line)
    
    # get hqdefault
    cover = f"https://i.ytimg.com/vi/{d['id']}/hqdefault.jpg" if d.get('id') else ""
        
    title = d.get("title", "")
    artist = d.get("uploader", "Unknown")
    album = "Unknown"
    
    if '|' in title:
        parts = [p.strip() for p in title.split('|')]
        title = parts[0]
        if len(parts) > 1 and 'HD' not in parts[1] and 'Lyrical' not in parts[1]:
            album = parts[1]
    elif '-' in title:
        parts = [p.strip() for p in title.split('-')]
        title = parts[0]

    title = re.sub(r'\(.*?\)', '', title)
    title = re.sub(r'\[.*?\]', '', title)
    title = re.sub(r'(?i)Lyrical', '', title)
    title = re.sub(r'(?i)Video', '', title).strip()

    songs.append({
        "id": f"{i+1:02d}",
        "title": title,
        "artist": artist,
        "album": album,
        "year": "2024",
        "artwork": {
            "cover": cover
        },
        "playback": {
            "youtubeId": d.get("id", "")
        },
        "accent": "#c4736a"
    })

out = 'import type { PlaybackReference } from "../lib/playback/types";\n\n'
out += 'export interface Song {\n'
out += '  id: string;\n'
out += '  title: string;\n'
out += '  artist: string;\n'
out += '  album?: string;\n'
out += '  year?: string;\n'
out += '  artwork: {\n'
out += '    cover: string;\n'
out += '  };\n'
out += '  playback: PlaybackReference;\n'
out += '  accent: string;\n'
out += '}\n\n'
out += 'export const songs: Song[] = [\n'

for s in songs:
    out += '  {\n'
    out += f'    id: "{s["id"]}",\n'
    out += f'    title: {json.dumps(s["title"])},\n'
    out += f'    artist: {json.dumps(s["artist"])},\n'
    if s["album"] and s["album"] != "Unknown":
        out += f'    album: {json.dumps(s["album"])},\n'
    out += f'    year: "{s["year"]}",\n'
    out += '    artwork: {\n'
    out += f'      cover: "{s["artwork"]["cover"]}"\n'
    out += '    },\n'
    out += '    playback: {\n'
    out += f'      youtubeId: "{s["playback"]["youtubeId"]}"\n'
    out += '    },\n'
    out += f'    accent: "{s["accent"]}"\n'
    out += '  },\n'

out += '];\n'

with codecs.open('data/songs.ts', 'w', 'utf-8') as f:
    f.write(out)

print(f"Parsed {len(songs)} songs and wrote to data/songs.ts")
