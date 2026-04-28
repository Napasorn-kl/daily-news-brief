import os
import requests
import feedparser
from datetime import datetime

LINE_API_URL = "https://api.line.me/v2/bot/message/push"
TOKEN = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
USER_ID = os.environ["LINE_USER_ID"]

RSS_FEEDS = [
    ("BBC News", "http://feeds.bbci.co.uk/news/world/rss.xml"),
    ("Reuters", "https://feeds.reuters.com/reuters/topNews"),
]

def fetch_headlines(feed_url, limit=3):
    feed = feedparser.parse(feed_url)
    headlines = []
    for entry in feed.entries[:limit]:
        headlines.append(f"• {entry.title}")
    return headlines

def build_message():
    today = datetime.now().strftime("%d %b %Y")
    lines = [f"📰 Daily News Brief — {today}\n"]
    for name, url in RSS_FEEDS:
        headlines = fetch_headlines(url)
        if headlines:
            lines.append(f"【{name}】")
            lines.extend(headlines)
            lines.append("")
    return "\n".join(lines).strip()

def send_line_message(text):
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": USER_ID,
        "messages": [{"type": "text", "text": text}],
    }
    resp = requests.post(LINE_API_URL, headers=headers, json=payload)
    resp.raise_for_status()
    print(f"Sent: HTTP {resp.status_code}")

if __name__ == "__main__":
    message = build_message()
    send_line_message(message)
