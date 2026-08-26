import re

with open('data/songs.ts', 'r', encoding='utf-8') as f:
    content = f.read()

yt_ids = [
    "B6T0qtasUzQ",
    "9BWNft9Z4qo",
    "6DCOjq0omBc",
    "OfF_nuC6wl0",
    "JeGBNhyJeE4",
    "v_L-bAB1kUA",
    "BDQG49CgQL4",
    "lrAM_H7v8wM",
    "2d4I1xW2sNk",
    "k7fPoKUXaWM",
    "ri3NctAmkWE",
    "2drIKUOCZxU",
    "r-XG86T2jNc",
    "M51OYEo2yjc",
    "uq_kkYsHEK0"
]

for id in yt_ids:
    content = re.sub(r'youtubeId: \"[^\"]*\"', f'youtubeId: "{id}"', content, count=1)

with open('data/songs.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done updating official YouTube IDs")
