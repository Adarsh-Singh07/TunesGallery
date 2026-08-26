import json
import re

# Read the YT IDs we found
with open('scraped_data.json', 'r') as f:
    scraped = json.load(f)

# Read songs.ts
with open('sites/adhurekisse/data/songs.ts', 'r', encoding='utf-8') as f:
    content = f.read()

for item in scraped:
    # Match the title using regex or just simple replacement
    # item['title'] contains e.g. "Soniye K.K. Heartless"
    # We'll just replace the empty youtubeId with the scraped one
    title_words = item['title'].split(' K.K.')[0].strip()
    
    if item['yt']:
        # Find the song block
        pattern = r'(title:\s*[\'"]' + re.escape(title_words) + r'[\'"][\s\S]*?youtubeId:\s*[\'"])([\'"])'
        replacement = r'\g<1>' + item['yt'] + r'\g<2>'
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)

with open('sites/adhurekisse/data/songs.ts', 'w', encoding='utf-8') as f:
    f.write(content)
