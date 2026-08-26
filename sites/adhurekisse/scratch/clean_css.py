import re

with open('app/globals.css', 'rb') as f:
    raw = f.read()

# The file contains UTF-8 until some point, then UTF-16LE.
# Since we appended it, we can just decode the first part as utf-8 and the second part as utf-16le.
# Let's find the first null byte which indicates the start of UTF-16LE.
idx = raw.find(b'\x00')
if idx != -1:
    # The UTF-16LE part starts slightly before the null byte, likely at the start of the appended text.
    # We can just decode the whole file by ignoring errors or removing null bytes?
    # Actually, removing null bytes works for ASCII CSS!
    clean = raw.replace(b'\x00', b'').decode('utf-8')
    with open('app/globals.css', 'w', encoding='utf-8') as f:
        f.write(clean)
    print("Cleaned!")
else:
    print("No null bytes found.")
