/**

- DealsPulse Bot — Node.js version
- =================================
- Scrapes Amazon deals, updates public/deals.json,
- and sends messages from YOUR WhatsApp number to your groups.
- 
- SETUP:
- npm install axios cheerio whatsapp-web.js qrcode-terminal node-cron dotenv
- 
- FIRST RUN:
- node bot/bot.js
- Scan the QR code with your WhatsApp → stays logged in after that
  */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const AFFILIATE_TAG     = process.env.AMAZON_AFFILIATE_TAG || 'youraffid-20';
const DEALS_JSON_PATH   = path.join(__dirname, '..', 'public', 'deals.json');
const MIN_DISCOUNT_PCT  = parseInt(process.env.MIN_DISCOUNT_PCT || '20');
const MAX_DEALS_PER_RUN = parseInt(process.env.MAX_DEALS_PER_RUN || '10');
const SCAN_INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MIN || '30');
// Comma-separated WhatsApp group names exactly as they appear in your WhatsApp
const WHATSAPP_GROUPS   = (process.env.WHATSAPP_GROUPS || '').split(',').map(g => g.trim()).filter(Boolean);

// ── WHATSAPP CLIENT ───────────────────────────────────────────────────────────
const whatsapp = new Client({
authStrategy: new LocalAuth(), // saves session so you only scan QR once
puppeteer: {
args: ['–no-sandbox', '–disable-setuid-sandbox'],
},
});

let whatsappReady = false;

whatsapp.on('qr', (qr) => {
console.log('\n📱 Scan this QR code with your WhatsApp:\n');
qrcode.generate(qr, { small: true });
console.log('\nOpen WhatsApp → Linked Devices → Link a Device\n');
});

whatsapp.on('ready', () => {
whatsappReady = true;
console.log('WhatsApp connected — messages will send from your number!');
});

whatsapp.on('auth_failure', () => {
console.error('❌ WhatsApp auth failed — delete .wwebjs_auth folder and restart.');
});

whatsapp.on('disconnected', () => {
whatsappReady = false;
console.warn('⚠️  WhatsApp disconnected. Reconnecting…');
whatsapp.initialize();
});

// ── SCRAPER ───────────────────────────────────────────────────────────────────
const HEADERS_POOL = [
{ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
{ "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", "Accept-Language": "en-GB,en;q=0.9" },
];

function randomHeaders() {
return HEADERS_POOL[Math.floor(Math.random() * HEADERS_POOL.length)];
}

function parsePrice(text) {
if (!text) return null;
const num = parseFloat(text.replace(/[$,]/g, "").trim());
return isNaN(num) ? null : num;
}

function sleep(ms) {
return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeDeals() {
const deals = [];
const seen = new Set();

try {
await sleep(2000 + Math.random() * 3000);
const { data: html } = await axios.get('https://www.amazon.com/gp/goldbox', {
headers: randomHeaders(),
timeout: 15000,
});

```
const $ = cheerio.load(html);
const cards = $("div[data-asin]").toArray();
console.log('Found ${cards.length} candidate cards');

for (const card of cards.slice(0, MAX_DEALS_PER_RUN * 3)) {
  try {
    const asin = $(card).attr("data-asin");
    if (!asin || seen.has(asin)) continue;

    const titleEl = $(card).find("a[aria-label], .a-size-base-plus, h2 a").first();
    if (!titleEl.length) continue;
    const title = titleEl.text().trim();

    const dealPrice = parsePrice($(card).find(".a-price .a-offscreen, .dealPriceText").first().text());
    const origPrice = parsePrice($(card).find(".a-text-price .a-offscreen, .originalPriceText").first().text());

    if (!dealPrice || !origPrice || origPrice <= dealPrice) continue;
    const discount = Math.round((1 - dealPrice / origPrice) * 100);
    if (discount < MIN_DISCOUNT_PCT) continue;

    const image    = $(card).find("img").first().attr("src") || "";
    const category = $(card).find(".a-color-secondary").first().text().trim() || "General";
    const expires  = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

    deals.push({
      id: asin,
      title: title.slice(0, 120),
      category,
      originalPrice: origPrice,
      dealPrice,
      discount,
      image,
      affiliate_url: 'https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}',
      store: "Amazon",
      expires,
      hot: discount >= 40,
      posted_at: new Date().toISOString(),
    });

    seen.add(asin);
    if (deals.length >= MAX_DEALS_PER_RUN) break;
  } catch (e) {
    // skip bad card
  }
}
```

} catch (err) {
console.warn('Scrape failed: ${err.message}');
}

console.log('Scraped ${deals.length} valid deals (≥${MIN_DISCOUNT_PCT}% off)');
return deals;
}

// ── SAVE DEALS ────────────────────────────────────────────────────────────────
function saveDeals(deals) {
let existing = [];
try {
existing = JSON.parse(fs.readFileSync(DEALS_JSON_PATH, 'utf8'));
} catch (e) {
// file doesn’t exist yet
}

const existingIds = new Set(existing.map(d => d.id));
const newDeals = deals.filter(d => !existingIds.has(d.id));

if (!newDeals.length) {
console.log('No new deals to save.');
return 0;
}

const allDeals = [...newDeals, ...existing].slice(0, 100);fs.mkdirSync(path.dirname(DEALS_JSON_PATH), { recursive: true });
fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(allDeals, null, 2));
console.log('Saved ${newDeals.length} new deals → deals.json');
return newDeals.length;
}

// ── WHATSAPP SENDER ───────────────────────────────────────────────────────────
async function sendToWhatsApp(deals) {
if (!whatsappReady) {
console.warn('WhatsApp not ready — skipping messages.');
return;
}
if (!WHATSAPP_GROUPS.length) {
console.warn('No WHATSAPP_GROUPS configured — skipping.');
return;
}

// Get top 3 hottest deals
const top3 = […deals].sort((a, b) => b.discount - a.discount).slice(0, 3);

// Find group chats by name
const chats = await whatsapp.getChats();
const groupChats = chats.filter(
c => c.isGroup && WHATSAPP_GROUPS.some(name => c.name.toLowerCase().includes(name.toLowerCase()))
);

if (!groupChats.length) {
console.warn('No matching WhatsApp groups found. Check WHATSAPP_GROUPS in .env');
console.log('Available groups:', chats.filter(c => c.isGroup).map(c => c.name).join(', '));
return;
}

for (const deal of top3) {
const savings = (deal.originalPrice - deal.dealPrice).toFixed(2);
const message =
`🔥 *DealsPulse Alert!*\n\n` +
`*${deal.title}*\n\n` +
`💰 ~$${deal.originalPrice.toFixed(2)}~ → *$${deal.dealPrice.toFixed(2)}* (${deal.discount}% OFF)\n` +
`💵 You save *$${savings}*\n\n` +
`🛒 ${deal.affiliate_url}\n\n` +
`⏰ Expires: ${deal.expires}\n` +
`_Via DealsPulse · Amazon Affiliate_`;

```
for (const group of groupChats) {
  try {
    await group.sendMessage(message);
    console.log('✅ Sent to group: ${group.name}');
    await sleep(2000); // small delay between messages
  } catch (err) {
    console.error('Failed to send to ${group.name}: ${err.message}');
  }
}
```

}
}

// ── MAIN RUN ──────────────────────────────────────────────────────────────────
async function runBot() {
console.log('='.repeat(55));
console.log('🤖 DealsPulse scanning at ${new Date().toLocaleTimeString()}');

const deals = await scrapeDeals();
if (!deals.length) {
console.log('No qualifying deals this run.');
return;
}

const saved = saveDeals(deals);
if (saved) {
await sendToWhatsApp(deals);
}

console.log('✅ Done: ${saved} new deals saved.');
}

// ── START ─────────────────────────────────────────────────────────────────────
console.log('🚀 DealsPulse Bot starting…');
whatsapp.initialize();

// Wait for WhatsApp to connect then do first run
whatsapp.once('ready', async () => {
await runBot();
// Schedule recurring runs
cron.schedule(`*/${SCAN_INTERVAL_MIN} * * * *`, runBot);
console.log(`⏰ Scheduled to run every ${SCAN_INTERVAL_MIN} minutes`);
});
