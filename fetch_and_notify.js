/**
 * AI Daily LINE Notifier — Tier 2 (Node.js)
 * รันผ่าน Hostinger Node.js Web App + Cron
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cron = require("node-cron");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// --- Config ---
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const GNEWS_KEYWORDS = "AI OR Generative AI OR Machine Learning OR Tech Innovation";
const ICT_OFFSET = 7 * 3600 * 1000;
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const _now = new Date(Date.now() + ICT_OFFSET);
const TODAY = `${_now.getUTCDate()} ${THAI_MONTHS[_now.getUTCMonth()]} ${_now.getUTCFullYear() + 543}`;

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "daily_news.log");

// Ensure log dir exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level, msg) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      })
      .on("error", reject);
  });
}

function httpPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
    };
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.request(url, options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => (responseData += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function fetchNews() {
  log("INFO", "Fetching news from GNews API...");
  const url =
    "https://gnews.io/api/v4/search?" +
    new URLSearchParams({
      q: GNEWS_KEYWORDS,
      token: GNEWS_API_KEY,
      lang: "en",
      max: 10,
      sortby: "publishedAt",
    });
  const data = await httpGet(url);
  log("INFO", `Fetched ${data.articles.length} articles`);
  return data.articles;
}

async function summarizeWithGemini(articles) {
  log("INFO", "Summarizing with Gemini 1.5 Flash...");

  const newsText = articles
    .slice(0, 10)
    .map(
      (a) =>
        `Title: ${a.title}\nSource: ${a.source.name}\nURL: ${a.url}\nContent: ${a.description || ""}`
    )
    .join("\n\n");

  const prompt = `คุณคือบรรณาธิการข่าว AI สรุปข่าวเป็นภาษาไทยตาม Template นี้เท่านั้น ห้ามเพิ่มหรือลดหัวข้อ:

🤖 AI DAILY | ${TODAY}
ธีมวันนี้: [คำเดียวหรือวลีสั้น]

【บทสรุป】
• [ประเด็นสำคัญที่ 1]
• [ประเด็นสำคัญที่ 2]
• [ประเด็นสำคัญที่ 3]

🇹🇭 ผลกระทบต่อไทย
• [ใคร/อะไร/ต้องทำอะไร — เลือก 1 ข้อสำคัญที่สุด]

【ข่าวเด่น】
1) [หัวข้อข่าว]
   → [so-what 1 บรรทัด]
2) [หัวข้อข่าว]
   → [so-what 1 บรรทัด]
3) [หัวข้อข่าว]
   → [so-what 1 บรรทัด]

👀 จับตา
• [เหตุการณ์ที่น่าจับตา + กรอบเวลา]

📎 ที่มา
- [ชื่อสำนักข่าวของข่าวที่ 1] · [URL จริงของข่าวที่ 1]
- [ชื่อสำนักข่าวของข่าวที่ 2] · [URL จริงของข่าวที่ 2]
- [ชื่อสำนักข่าวของข่าวที่ 3] · [URL จริงของข่าวที่ 3]

กฎเหล็ก: ใช้ภาษาไทยทั้งหมด, ห้ามเพิ่มหัวข้อนอก Template, แต่ละ bullet กระชับที่สุด, ใช้ชื่อสำนักข่าวและ URL จากข้อมูลที่ให้มาเท่านั้น ห้ามแต่ง URL ขึ้นมาเอง

ข่าววันนี้:

${newsText}`;

  const response = await httpPost(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
    }
  );

  const summary = response.candidates[0].content.parts[0].text.trim();
  log("INFO", `Summary generated (${summary.length} chars)`);
  return summary;
}

async function sendLine(message) {
  log("INFO", "Sending to LINE...");
  const response = await httpPost(
    "https://api.line.me/v2/bot/message/broadcast",
    {
      messages: [{ type: "text", text: message }],
    },
    { Authorization: `Bearer ${LINE_TOKEN}` }
  );
  log(
    "INFO",
    `LINE broadcast OK — message ID: ${response.sentMessages[0].id}`
  );
}

async function main() {
  log("INFO", "=== AI Daily LINE Notifier started ===");
  const articles = await fetchNews();
  if (!articles || articles.length === 0) {
    log("WARN", "No articles found — skipping");
    return;
  }
  const summary = await summarizeWithGemini(articles);
  await sendLine(summary);
  log("INFO", "=== Done ===");
}

// --- Express Server ---
const app = express();
const PORT = process.env.PORT || 3000;
const CRON_SECRET = process.env.CRON_SECRET || "";

app.get("/", (_req, res) => res.send("AI Daily Notifier is running ✅"));

app.get("/run", async (req, res) => {
  if (CRON_SECRET && req.query.token !== CRON_SECRET) {
    return res.status(401).send("Unauthorized");
  }
  try {
    await main();
    res.send("Done ✅");
  } catch (err) {
    log("ERROR", err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.listen(PORT, () => log("INFO", `Server listening on port ${PORT}`));

// --- Cron Job: รันทุกวัน 08:00 ICT (01:00 UTC) ---
cron.schedule("0 8 * * *", () => {
  log("INFO", "Cron triggered — running daily job...");
  main().catch((err) => log("ERROR", err.message));
}, { timezone: "Asia/Bangkok" });
log("INFO", "Cron registered: daily at 08:00 Asia/Bangkok");
