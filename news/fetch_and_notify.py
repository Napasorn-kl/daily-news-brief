"""
AI Daily LINE Notifier — Tier 2
รันผ่าน Hostinger Cron Job หรือ GitHub Actions
"""
import sys
import json
import logging
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv
import os

# --- Config ---
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

LOG_FILE = BASE_DIR / "logs" / "daily_news.log"
LOG_FILE.parent.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

GNEWS_API_KEY          = os.environ["GNEWS_API_KEY"]
OPENAI_API_KEY         = os.environ["OPENAI_API_KEY"]
LINE_TOKEN             = os.environ["LINE_CHANNEL_ACCESS_TOKEN"]
LINE_USER_ID           = os.environ["LINE_USER_ID"]

GNEWS_URL = "https://gnews.io/api/v4/search"
GNEWS_KEYWORDS = "AI OR Generative AI OR Machine Learning OR Tech Innovation"

ICT = timezone(timedelta(hours=7))
TODAY = datetime.now(ICT).strftime("%d/%m/%Y")

SYSTEM_PROMPT = f"""คุณคือบรรณาธิการข่าว AI ระดับมืออาชีพ สรุปข่าวเป็นภาษาไทยตาม Template นี้เท่านั้น:

🤖 AI DAILY | {TODAY}
ธีมวันนี้: [ธีมสั้นๆ 1 ประโยค]

【บทสรุป】
[สรุปภาพรวมของวัน 2-3 ประโยค]

🇹🇭 ผลกระทบต่อไทย
[วิเคราะห์ผลกระทบเชิงธุรกิจและสังคมไทย 2-3 ประโยค]

【ข่าวเด่น】
① [หัวข้อ]
[สรุป 1-2 ประโยค] → So what: [ผลกระทบ]

② [หัวข้อ]
[สรุป 1-2 ประโยค] → So what: [ผลกระทบ]

③ [หัวข้อ]
[สรุป 1-2 ประโยค] → So what: [ผลกระทบ]

👀 จับตา
[ประเด็นที่ต้องติดตามต่อ 1-2 ประโยค]

📎 ที่มา
[ชื่อข่าว 1]: [URL]
[ชื่อข่าว 2]: [URL]
[ชื่อข่าว 3]: [URL]

กฎเหล็ก: ห้ามเพิ่มหัวข้อนอก Template, ใช้ภาษาไทยทั้งหมด, รักษาโครงสร้างให้ครบถ้วน"""


def fetch_news() -> list[dict]:
    """ดึงข่าวจาก GNews API"""
    log.info("Fetching news from GNews API...")
    resp = requests.get(GNEWS_URL, params={
        "q": GNEWS_KEYWORDS,
        "token": GNEWS_API_KEY,
        "lang": "en",
        "max": 10,
        "sortby": "publishedAt",
    }, timeout=15)
    resp.raise_for_status()
    articles = resp.json().get("articles", [])
    log.info(f"Fetched {len(articles)} articles")
    return articles


def summarize_with_openai(articles: list[dict]) -> str:
    """สรุปข่าวด้วย OpenAI gpt-4o-mini"""
    log.info("Summarizing with OpenAI gpt-4o-mini...")
    news_text = "\n\n".join([
        f"Title: {a['title']}\nSource: {a['source']['name']}\nURL: {a['url']}\nContent: {a.get('description', '')}"
        for a in articles[:10]
    ])
    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"ข่าววันนี้:\n\n{news_text}"},
        ],
        max_tokens=1500,
        temperature=0.4,
    )
    summary = response.choices[0].message.content.strip()
    log.info(f"Summary generated ({len(summary)} chars)")
    return summary


def send_line(message: str) -> None:
    """ส่งข้อความไปยัง LINE Messaging API"""
    log.info("Sending to LINE...")
    resp = requests.post(
        "https://api.line.me/v2/bot/message/push",
        headers={
            "Authorization": f"Bearer {LINE_TOKEN}",
            "Content-Type": "application/json",
        },
        json={"to": LINE_USER_ID, "messages": [{"type": "text", "text": message}]},
        timeout=15,
    )
    resp.raise_for_status()
    log.info(f"LINE sent OK — message ID: {resp.json()['sentMessages'][0]['id']}")


def main():
    log.info("=== AI Daily LINE Notifier started ===")
    try:
        articles = fetch_news()
        if not articles:
            log.warning("No articles found — skipping")
            return
        summary = summarize_with_openai(articles)
        send_line(summary)
        log.info("=== Done ===")
    except requests.HTTPError as e:
        log.error(f"HTTP error: {e.response.status_code} {e.response.text}")
        sys.exit(1)
    except Exception as e:
        log.error(f"Unexpected error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
