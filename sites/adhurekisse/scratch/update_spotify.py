import json
import re

with open('data/songs.ts', 'r', encoding='utf-8') as f:
    content = f.read()

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

for idx, data in enumerate(spotify_data):
    # Update the spotifyTrackId
    content = re.sub(r'spotifyTrackId:\s*\"[^\"]*\"', f'spotifyTrackId: "{data["track_id"]}"', content, count=1)
    
    # We also need to add artwork if it doesn't exist.
    # Currently it might look like:
    # tags: ["...", "..."],
    # playback: { ... }
    # We want to ensure artwork: { cover: "url" } exists.
    # Since the structure is quite uniform, we can just insert it before `playback:`
    # Let's replace `playback: {` with `artwork: { cover: "URL" },\n    playback: {` for the nth occurrence
    # But only if it doesn't already have an artwork block. 
    # Or just write a quick script to find the object and insert.
    pass

# We will just split the content by `{ id:` and reconstruct it
parts = content.split('  {\n    id: ')
new_parts = [parts[0]]
for i, part in enumerate(parts[1:]):
    track_id = spotify_data[i]["track_id"]
    cover = spotify_data[i]["cover_url"]
    
    # insert artwork if not present
    if 'artwork:' not in part:
        part = part.replace('    accent:', f'    artwork: {{\n      cover: "{cover}",\n    }},\n    accent:')
    else:
        # replace existing cover URL if it's there
        if 'cover:' in part:
            part = re.sub(r'cover:\s*\"[^\"]*\"', f'cover: "{cover}"', part)
        else:
            part = part.replace('artwork: {', f'artwork: {{\n      cover: "{cover}",')
            
    new_parts.append('  {\n    id: ' + part)

content = "".join(new_parts)

with open('data/songs.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
