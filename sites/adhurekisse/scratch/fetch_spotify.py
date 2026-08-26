import urllib.request, json
import urllib.parse
import time

songs = [
    "Soniye K.K. Heartless",
    "Kabhi Aayine Pe Likha K.K. Pal",
    "Tu Jo Mila K.K. Bajrangi Bhaijaan",
    "Sajde K.K. Khatta Meetha",
    "Kal Ki Hi Baat Hai K.K. Jhankaar Beats",
    "Dilnashin Dilnashin K.K. Aashiq Banaya Aapne",
    "I Am In Love K.K. Once Upon a Time in Mumbaai",
    "Kya Mujhe Pyar Hai K.K. Woh Lamhe",
    "Beete Lamhein K.K. The Train",
    "Mera Pehla Pehla Pyaar K.K.",
    "Labon Ko K.K. Bhool Bhulaiyaa",
    "Ajab Si K.K. Om Shanti Om",
    "Zindagi Do Pal Ki K.K. Kites",
    "Dil Kyun Yeh Mera K.K. Kites",
    "Jaane Kiske Khwaab K.K. Guzaarish"
]

results = []
for song in songs:
    url = f"https://html.duckduckgo.com/html/?q=site:open.spotify.com/track+{urllib.parse.quote(song)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        if 'open.spotify.com/track/' in html:
            idx = html.split('open.spotify.com/track/')[1].split('?')[0].split('"')[0].split('<')[0]
            # Strip trailing slash or anything
            idx = idx.replace('\\', '').replace('/', '')
            print(f"{song} -> {idx}")
            results.append(idx)
        else:
            print(f"{song} -> None")
            results.append(None)
    except Exception as e:
        print(f"{song} -> Error: {e}")
        results.append(None)
    time.sleep(1)
