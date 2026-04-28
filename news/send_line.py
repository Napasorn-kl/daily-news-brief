import sys, os, re, json, time
import urllib.request

token = os.environ["LINE_TOKEN"]
user_id = os.environ["LINE_USER_ID"]
filepath = sys.argv[1]

content = open(filepath, encoding="utf-8").read()

sections = re.split(r'(?=^## \[\d)', content, flags=re.MULTILINE)
sections = [s.strip() for s in sections if s.strip()]

header_match = re.match(r'^(.*?)(?=^## \[)', content, re.DOTALL | re.MULTILINE)
header = header_match.group(1).strip() if header_match else ""

def send(text):
    if not text.strip():
        return
    payload = json.dumps({
        "to": user_id,
        "messages": [{"type": "text", "text": text}]
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.line.me/v2/bot/message/push",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req) as resp:
        print(f"  → {resp.status} {resp.read().decode()[:80]}")
    time.sleep(1)

if sections:
    first = f"{header}\n\n{sections[0]}" if header else sections[0]
    print("Sending [Header + Section 1]")
    send(first)
    for i, sec in enumerate(sections[1:], 2):
        print(f"Sending [Section {i}]")
        send(sec)
