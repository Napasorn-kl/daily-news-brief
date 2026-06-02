/**
 * AI Daily LINE Notifier — Tier 2 (Node.js)
 * รันผ่าน Hostinger Node.js Web App + Cron
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// --- Config ---
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_USER_ID = process.env.LINE_USER_ID;

const GNEWS_KEYWORDS = "AI OR Generative AI OR Machine Learning OR Tech Innovation";
const ICT_OFFSET = 7 * 3600 * 1000;
const TODAY = new Date(Date.now() + ICT_OFFSET).toLocaleDateString("th-TH");

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

  const prompt = `คุณคือบรรณาธิการข่าว AI ระดับมืออาชีพ สรุปข่าวเป็นภาษาไทยตาม Template นี้เท่านั้น:

🤖 AI DAILY | ${TODAY}
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

กฎเหล็ก: ห้ามเพิ่มหัวข้อนอก Template, ใช้ภาษาไทยทั้งหมด, รักษาโครงสร้างให้ครบถ้วน

ข่าววันนี้:

${newsText}`;

  const response = await httpPost(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.4 },
    }
  );

  const summary = response.candidates[0].content.parts[0].text.trim();
  log("INFO", `Summary generated (${summary.length} chars)`);
  return summary;
}

async function sendLine(message) {
  log("INFO", "Sending to LINE...");
  const response = await httpPost(
    "https://api.line.me/v2/bot/message/push",
    {
      to: LINE_USER_ID,
      messages: [{ type: "text", text: message }],
    },
    { Authorization: `Bearer ${LINE_TOKEN}` }
  );
  log(
    "INFO",
    `LINE sent OK — message ID: ${response.sentMessages[0].id}`
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
