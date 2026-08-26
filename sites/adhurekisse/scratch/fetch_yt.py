import sys
from ytmusicapi import YTMusic
import json

songs = [
    "Soniye - K.K. Heartless",
    "Kabhi Aayine Pe Likha - K.K. Pal",
    "Tu Jo Mila - K.K. Bajrangi Bhaijaan",
    "Sajde - K.K. Khatta Meetha",
    "Kal Ki Hi Baat Hai - K.K. Jhankaar Beats",
    "Dilnashin Dilnashin - K.K. Aashiq Banaya Aapne",
    "I Am In Love - K.K. Once Upon a Time in Mumbaai",
    "Kya Mujhe Pyar Hai - K.K. Woh Lamhe",
    "Beete Lamhein - K.K. The Train",
    "Mera Pehla Pehla Pyaar - K.K.",
    "Labon Ko - K.K. Bhool Bhulaiyaa",
    "Ajab Si - K.K. Om Shanti Om",
    "Zindagi Do Pal Ki - K.K. Kites",
    "Dil Kyun Yeh Mera - K.K. Kites",
    "Jaane Kiske Khwaab - K.K. Guzaarish"
]

yt = YTMusic()
results = []
for song in songs:
    res = yt.search(song, filter="songs", limit=1)
    if res:
        results.append({
            "query": song,
            "youtubeId": res[0]["videoId"]
        })
    else:
        results.append({"query": song, "youtubeId": None})

print(json.dumps(results, indent=2))
