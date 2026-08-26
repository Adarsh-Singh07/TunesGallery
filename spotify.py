import urllib.request
import urllib.parse
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
    'Jaane Kiske Khwaab K.K. Guzaarish'
]

# Get anonymous token
try:
    req = urllib.request.Request('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', headers={'User-Agent': 'Mozilla/5.0'})
    res = urllib.request.urlopen(req).read().decode('utf-8')
    token = json.loads(res)['accessToken']
except Exception as e:
    print('Failed to get token:', e)
    token = None

if token:
    for s in songs:
        try:
            url = 'https://api.spotify.com/v1/search?q=' + urllib.parse.quote(s) + '&type=track&limit=1'
            req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'Mozilla/5.0'})
            res = urllib.request.urlopen(req).read().decode('utf-8')
            data = json.loads(res)
            tracks = data.get('tracks', {}).get('items', [])
            if tracks:
                track = tracks[0]
                sp_id = track['id']
                cover = track['album']['images'][0]['url'] if track['album']['images'] else ''
                print(f'{s} | SP: {sp_id} | COVER: {cover}')
            else:
                print(f'{s} | SP: NOT FOUND')
        except Exception as e:
            print(f'{s} | Error: {e}')
