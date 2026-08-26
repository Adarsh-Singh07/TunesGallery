import urllib.request
import urllib.parse
import re
import json

def get_token():
    req = urllib.request.Request('https://open.spotify.com/', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'\"accessToken\":\"(.*?)\"', html)
        if match:
            return match.group(1)
        # Maybe another pattern
        match = re.search(r'\"clientId\":\"(.*?)\"', html)
        if match:
            return None # Need client creds
    except Exception as e:
        print(e)
    return None

def search_spotify(token, query):
    url = f"https://api.spotify.com/v1/search?q={urllib.parse.quote(query)}&type=track&limit=1"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', 'User-Agent': 'Mozilla/5.0'})
    try:
        resp = urllib.request.urlopen(req).read().decode('utf-8')
        data = json.loads(resp)
        tracks = data.get('tracks', {}).get('items', [])
        if tracks:
            return tracks[0]['id'], tracks[0]['album']['images'][0]['url']
    except Exception as e:
        pass
    return None, None

token = get_token()
if token:
    print("Token found")
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
    for s in songs:
        tid, img = search_spotify(token, s)
        print(f"{s} -> {tid} | {img}")
else:
    print("Failed to get token")
