import urllib.request
import urllib.parse
import re
import json

songs = [
    'Soniye K.K. Heartless',
    'Kabhi Aayine Pe Likha K.K. Pal',
    'Tu Jo Mila K.K. Bajrangi Bhaijaan',
    'Sajde K.K. Khatta Meetha',
    'Kal Ki Hi Baat Hai K.K. Jhankaar Beats',
    'Dilnashin Dilnashin K.K. Aashiq Banaya Aapne',
    'I Am In Love K.K. Once Upon a Time in Mumbaai',
    'Kya Mujhe Pyar Hai K.K. Woh Lamhe',
    'Beete Lamhein K.K. The Train',
    'Mera Pehla Pehla Pyaar K.K.',
    'Labon Ko K.K. Bhool Bhulaiyaa',
    'Ajab Si K.K. Om Shanti Om',
    'Zindagi Do Pal Ki K.K. Kites',
    'Dil Kyun Yeh Mera K.K. Kites',
    'Jaane Kiske Khwaab K.K.'
]

results = []

for s in songs:
    yt_id = ''
    try:
        url = 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(s)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'\"videoId\":\"([a-zA-Z0-9_-]{11})\"', html)
        if match:
            yt_id = match.group(1)
    except Exception as e:
        pass

    sp_id = ''
    # To get spotify IDs, maybe we search iTunes API to get ISRC, then search Spotify API using ISRC? No token.
    # What if we search duckduckgo lite?
    try:
        ddg = 'https://lite.duckduckgo.com/lite/'
        data = urllib.parse.urlencode({'q': s + ' site:open.spotify.com/track'}).encode('utf-8')
        req = urllib.request.Request(ddg, data=data, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'track/([a-zA-Z0-9]{22})', html)
        if match:
            sp_id = match.group(1)
    except Exception as e:
        pass

    cover = ''
    try:
        itunes_url = 'https://itunes.apple.com/search?term=' + urllib.parse.quote(s) + '&media=music&limit=1'
        req = urllib.request.Request(itunes_url)
        res = urllib.request.urlopen(req).read().decode('utf-8')
        data = json.loads(res)
        if data['resultCount'] > 0:
            cover = data['results'][0].get('artworkUrl100', '').replace('100x100bb', '600x600bb')
    except Exception as e:
        pass

    results.append({'title': s, 'yt': yt_id, 'sp': sp_id, 'cover': cover})
    print(f"{s} | YT: {yt_id} | SP: {sp_id}")

with open('scraped_data.json', 'w') as f:
    json.dump(results, f)
