import re

with open('data/songs.ts', 'r', encoding='utf-8') as f:
    content = f.read()

yt_ids = [
    '7R2sHu4et84', 'A-U6zATa7Tc', 'iEIEtUuEkxc', 'zfABYXP_NSA',
    'fUreGF5euAw', 'tAJY0cLLBHY', '0lYjw74Fsmk', 'XPu9ZE4Onzc',
    '8pMiuAXNBf8', 'OW6LBjKvTpo', '12pMB_mCBOo', 'bdS6OoH1W2A',
    'LPYutSWiG4c', 'GlMExeJMAGs', 'OQcGv04yhH4'
]

for id in yt_ids:
    content = re.sub(r'youtubeId: \"[^\"]*\"', f'youtubeId: "{id}"', content, count=1)

with open('data/songs.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
