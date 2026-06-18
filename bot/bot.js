/**
 * DealsPulse WhatsApp Bot — Local
 * ================================
 * Reads deals from your LIVE site's deals.json (the single source of truth,
 * maintained by GitHub Actions), tracks which deals it has already announced,
 * and posts any NEW deals to your WhatsApp group(s) from YOUR number.
 *
 * RUN:
 *   node bot.js
 *   Scan the QR code on first run.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const cron = require("node-cron");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

// ── CONFIG ─────────────────────────────────────────────────────────────
const IS_MAC            = process.platform === "darwin";
const DEALS_URL         = process.env.DEALS_URL || "https://affilate-marketing-20.vercel.app/deals.json";
const SITE_BASE         = process.env.SITE_BASE || "https://affilate-marketing-20.vercel.app";
const SCAN_INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MIN || "60");
const MAX_PER_RUN       = parseInt(process.env.MAX_DEALS_PER_RUN || "1"); // post one deal per run
const SEEN_FILE         = IS_MAC ? path.join(__dirname, "announced.json") : "/data/announced.json";
const WHATSAPP_GROUPS   = (process.env.WHATSAPP_GROUPS || "").split(",").map(g => g.trim()).filter(Boolean);
const GROUP_LINK        = process.env.GROUP_LINK || ""; // your WhatsApp group invite link (https://chat.whatsapp.com/...)

// ── WHATSAPP CLIENT ──────────────────────────────────────────────────────────
const SESSION_PATH = process.env.SESSION_PATH || (IS_MAC ? undefined : "/data/wwebjs_auth");

const whatsapp = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    executablePath: IS_MAC ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  },
});

let whatsappReady = false;

whatsapp.on("qr", (qr) => {
  // Terminal QR for local use
  console.log("\nScan this QR code with your WhatsApp:\n");
  qrcode.generate(qr, { small: true });
  // Also print a URL you can open in a browser to scan (for cloud deploys)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  console.log("\nOR open this URL in your browser to scan:\n");
  console.log(qrUrl);
  console.log("\nOpen WhatsApp -> Linked Devices -> Link a Device\n");
});

whatsapp.on("ready", () => {
  whatsappReady = true;
  console.log("WhatsApp connected - messages will send from your number!");
});

whatsapp.on("auth_failure", () => {
  console.error("WhatsApp auth failed - delete .wwebjs_auth folder and restart.");
});

whatsapp.on("disconnected", () => {
  whatsappReady = false;
  console.warn("WhatsApp disconnected. Reconnecting...");
  whatsapp.initialize();
});

// ── HELPERS ─────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: { "User-Agent": "DealsPulseBot/1.0", "Accept": "application/json" }
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Bad JSON from " + url)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function loadAnnounced() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")));
  } catch (e) {
    return new Set();
  }
}

function saveAnnounced(set) {
  try {
    fs.writeFileSync(SEEN_FILE, JSON.stringify([...set]));
  } catch (e) {
    console.error("Could not save announced list:", e.message);
  }
}

// ── WHATSAPP SENDER ──────────────────────────────────────────────────────────
async function sendToWhatsApp(deals) {
  if (!whatsappReady) {
    console.warn("WhatsApp not ready - skipping.");
    return false;
  }
  if (!WHATSAPP_GROUPS.length) {
    console.warn("No WHATSAPP_GROUPS configured - skipping.");
    return false;
  }

  const chats = await whatsapp.getChats();
  const groupChats = chats.filter(
    c => c.isGroup && WHATSAPP_GROUPS.some(name => c.name.toLowerCase().includes(name.toLowerCase()))
  );

  if (!groupChats.length) {
    console.warn("No matching WhatsApp groups found. Check WHATSAPP_GROUPS in .env");
    console.log("Available groups:", chats.filter(c => c.isGroup).map(c => c.name).join(", "));
    return false;
  }

  for (const deal of deals) {
    const shareLink = `${SITE_BASE}/share/deal/${encodeURIComponent(deal.id)}`;

    // Line 1: product name
    let message = `*${deal.title}*\n\n`;

    // Line 2: price + original price crossed out (~text~ renders as strikethrough in WhatsApp)
    if (deal.dealPrice > 0) {
      message += `*$${deal.dealPrice.toFixed(2)}*`;
      if (deal.originalPrice > deal.dealPrice) {
        message += `  ~$${deal.originalPrice.toFixed(2)}~`;
      }
      message += `\n\n`;
    }

    // Line 3: website link (WhatsApp auto-generates the preview from this)
    message += `${shareLink}\n`;

    // Line 4: group invite link
    if (GROUP_LINK) {
      message += `\nJoin for more deals: ${GROUP_LINK}`;
    }

    for (const group of groupChats) {
      try {
        // Send image first
        const imageUrl = deal.image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";
        await group.sendMessage(imageUrl, { sendMediaAsDocument: false, caption: message });
        console.log(`Sent: ${deal.title.slice(0, 45)} -> ${group.name}`);
        await sleep(3000);
      } catch (err) {
        console.error(`Failed to send to ${group.name}: ${err.message}`);
      }
    }
  }
  return true;
}

// ── MAIN RUN ────────────────────────────────────────────────────────────
async function runBot() {
  console.log("=".repeat(55));
  console.log(`Checking for new deals at ${new Date().toLocaleTimeString()}`);

  let deals;
  try {
    deals = await fetchJson(DEALS_URL);
  } catch (e) {
    console.error(`Could not fetch deals: ${e.message}`);
    return;
  }

  if (!Array.isArray(deals) || !deals.length) {
    console.log("No deals on site yet.");
    return;
  }

  const announced = loadAnnounced();
  // Work through un-announced deals oldest-first so it drips steadily
  const unannounced = deals.filter(d => !announced.has(d.id));
  unannounced.sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
  const newDeals = unannounced.slice(0, MAX_PER_RUN);

  if (!newDeals.length) {
    console.log("No new deals to announce.");
    return;
  }

  console.log(`Found ${newDeals.length} new deal(s) to announce`);
  const sent = await sendToWhatsApp(newDeals);

  if (sent) {
    // Mark these as announced so we never repost them
    newDeals.forEach(d => announced.add(d.id));
    saveAnnounced(announced);
    console.log(`Done: announced ${newDeals.length} deal(s).`);
  }
}

// ── FIRST-RUN SEEDING ─────────────────────────────────────────────────────────
// On the very first run we DON'T mark everything as announced — we want the bot
// to drip out the existing backlog one per hour. We just create an empty seen
// file so the seeding only happens once.
async function seedIfFirstRun() {
  if (fs.existsSync(SEEN_FILE)) return; // already initialized
  saveAnnounced(new Set());
  console.log("First run: starting fresh. Will post existing deals one per hour, oldest first.");
}

// ── START ─────────────────────────────────────────────────────────────
console.log("DealsPulse WhatsApp Bot starting...");
whatsapp.initialize();

whatsapp.once("ready", async () => {
  await seedIfFirstRun();
  await runBot();
  cron.schedule(`*/${SCAN_INTERVAL_MIN} * * * *`, runBot);
  console.log(`Scheduled to check every ${SCAN_INTERVAL_MIN} minutes`);
});
