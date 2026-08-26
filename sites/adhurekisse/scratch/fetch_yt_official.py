import json
from ytmusicapi import YTMusic

songs = [
    "Soniye K.K. Heartless official",
    "Kabhi Aayine Pe Likha K.K. Pal official",
    "Tu Jo Mila K.K. Bajrangi Bhaijaan official",
    "Sajde K.K. Khatta Meetha official",
    "Kal Ki Hi Baat Hai K.K. Jhankaar Beats official",
    "Dilnashin Dilnashin K.K. Aashiq Banaya Aapne official",
    "I Am In Love K.K. Once Upon a Time in Mumbaai official",
    "Kya Mujhe Pyar Hai K.K. Woh Lamhe official",
    "Beete Lamhein K.K. The Train official",
    "Mera Pehla Pehla Pyaar K.K. official",
    "Labon Ko K.K. Bhool Bhulaiyaa official",
    "Ajab Si K.K. Om Shanti Om official",
    "Zindagi Do Pal Ki K.K. Kites official",
    "Dil Kyun Yeh Mera K.K. Kites official",
    "Jaane Kiske Khwaab K.K. Guzaarish official"
]

yt = YTMusic()
results = []
for song in songs:
    res = yt.search(song, filter="videos", limit=5)
    
    official_id = None
    for r in res:
        authors = [a['name'].lower() for a in r.get('artists', [])]
        title = r.get('title', '').lower()
        if 'remix' in title or 'lofi' in title or 'slowed' in title:
            continue
        
        # Check if it looks official
        if any(c in ' '.join(authors) for c in ['t-series', 'sony', 'zee', 'tips', 'saregama', 'venus', 'yrf', 'k.k.']):
            official_id = r['videoId']
            break
            
    if not official_id and res:
        official_id = res[0]['videoId']
        
    results.append({
        "query": song,
        "youtubeId": official_id
    })

print(json.dumps(results, indent=2))
