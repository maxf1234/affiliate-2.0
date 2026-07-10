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

// ── CONFIG ────────────────────────────────────────────────────────────────────
const IS_MAC            = process.platform === "darwin";
const DEALS_URL         = process.env.DEALS_URL || "https://affilate-2-0.vercel.app/deals.json";
const SITE_BASE         = process.env.SITE_BASE || "https://affilate-2-0.vercel.app";
const SCAN_INTERVAL_MIN = parseInt(process.env.SCAN_INTERVAL_MIN || "60"); // hourly-tier cadence + min gap between posts
const TIMEZONE          = process.env.BOT_TIMEZONE || "America/New_York";
const GROUP_LINK        = process.env.GROUP_LINK || "https://chat.whatsapp.com/LwxD0Pm4guRHt1n1YH8Wgx"; // WhatsApp group invite link

const parseGroups = (v) => (v || "").split(",").map(g => g.trim()).filter(Boolean);
// Two tiers of groups, each with its own schedule and its own history:
//   WHATSAPP_GROUPS     — one deal every hour (oldest un-posted first)
//   THRICE_DAILY_GROUPS — 3 deals/day: 9 AM 2nd best, 12 PM 3rd best, 9 PM best
const WHATSAPP_GROUPS     = parseGroups(process.env.WHATSAPP_GROUPS);
const THRICE_DAILY_GROUPS = parseGroups(process.env.THRICE_DAILY_GROUPS);

// `skip` = how many top-ranked deals to hold back, so the best of the day
// always goes out at 9 PM.
const POST_SLOTS = [
  { cron: "0 9 * * *",  skip: 1, label: "9:00 AM (2nd best)" },
  { cron: "0 12 * * *", skip: 1, label: "12:00 PM (3rd best)" },
  { cron: "0 21 * * *", skip: 0, label: "9:00 PM (best of the day)" },
];

const dataFile = (name) => IS_MAC ? path.join(__dirname, name) : "/data/" + name;

const AUDIENCES = {
  hourly: {
    label: "hourly",
    groups: WHATSAPP_GROUPS,
    seenFile: dataFile("announced.json"),          // existing file — history carries over
    lastPostFile: dataFile("last_post.json"),
    // steady drip: oldest un-announced deal first
    pick(unannounced) {
      unannounced.sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
      return unannounced[0];
    },
  },
  thrice: {
    label: "thrice-daily",
    groups: THRICE_DAILY_GROUPS,
    seenFile: dataFile("announced_thrice.json"),
    lastPostFile: dataFile("last_post_thrice.json"),
    // best-first by discount; skip holds the top deal(s) back for 9 PM
    pick(unannounced, skip = 0) {
      unannounced.sort((a, b) => (b.discount || 0) - (a.discount || 0));
      return unannounced[Math.min(skip, unannounced.length - 1)];
    },
  },
};

// ── WHATSAPP CLIENT ───────────────────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
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

// Timestamps of the last successful post (per tier), persisted so
// restarts/redeploys don't trigger an immediate extra message.
function loadLastPost(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).at || 0;
  } catch (e) {
    return 0;
  }
}

function saveLastPost(file) {
  try {
    fs.writeFileSync(file, JSON.stringify({ at: Date.now() }));
  } catch (e) {
    console.error("Could not save last-post time:", e.message);
  }
}

function loadAnnounced(file) {
  try {
    return new Set(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    return new Set();
  }
}

function saveAnnounced(file, set) {
  try {
    fs.writeFileSync(file, JSON.stringify([...set]));
  } catch (e) {
    console.error("Could not save announced list:", e.message);
  }
}

// ── WHATSAPP SENDER ───────────────────────────────────────────────────────────
async function sendToWhatsApp(deals, groupNames) {
  if (!whatsappReady) {
    console.warn("WhatsApp not ready - skipping.");
    return false;
  }

  const chats = await whatsapp.getChats();
  const groupChats = chats.filter(
    c => c.isGroup && groupNames.some(name => c.name.toLowerCase().includes(name.toLowerCase()))
  );

  if (!groupChats.length) {
    console.warn(`No WhatsApp groups matched [${groupNames.join(", ")}]. Check the group variables in .env / Railway.`);
    console.log("Available groups:", chats.filter(c => c.isGroup).map(c => c.name).join(", "));
    return false;
  }

  for (const deal of deals) {
    // Tracked link: counts the tap as WhatsApp traffic in /api/stats,
    // then redirects to the deal page on our site.
    const shareLink = `${SITE_BASE}/api/go?id=${encodeURIComponent(deal.id)}&src=wa&to=site`;

    // Compute savings
    const hasSavings = deal.originalPrice > 0 && deal.originalPrice > deal.dealPrice && deal.dealPrice > 0;
    const savings = hasSavings ? (deal.originalPrice - deal.dealPrice).toFixed(2) : null;
    const pctOff = hasSavings ? Math.round((1 - deal.dealPrice / deal.originalPrice) * 100) : null;

    // Headline by discount: 50%+ gets bold HOT DEAL with fire, else none
    const pct = pctOff ?? deal.discount ?? 0;
    let caption = "";
    if (pct >= 50) caption += `🔥 *HOT DEAL*\n\n`;
    caption += `📦 *${deal.title}*\n\n`;
    if (deal.dealPrice > 0) {
      caption += `💲 *Now:* $${deal.dealPrice.toFixed(2)}\n`;
      if (hasSavings) {
        caption += `🏷️ Was: ~$${deal.originalPrice.toFixed(2)}~\n`;
        caption += `💸 Save $${savings} (${pctOff}% OFF)\n`;
      }
      caption += `\n`;
    }
    caption += `🛒 *Grab it here:*\n${shareLink}\n\n`;
    caption += `━━━━━━━━━━━━━━\n\n`;
    if (GROUP_LINK) {
      caption += `📲 *Join DealsPulse for more daily deals:*\n${GROUP_LINK}`;
    }

    for (const group of groupChats) {
      try {
        // Try to send as image with caption (guaranteed visible image)
        let sent = false;
        if (deal.image && deal.image.startsWith("http")) {
          try {
            const { MessageMedia } = require("whatsapp-web.js");
            const media = await MessageMedia.fromUrl(deal.image, { unsafeMime: true });
            await group.sendMessage(media, { caption });
            sent = true;
          } catch (imgErr) {
            console.warn(`Image send failed, falling back to text: ${imgErr.message}`);
          }
        }

        // Fallback: send as plain text if image failed
        if (!sent) {
          await group.sendMessage(caption);
        }

        console.log(`Sent: ${deal.title.slice(0, 45)} -> ${group.name}`);
        await sleep(3000);
      } catch (err) {
        console.error(`Failed to send to ${group.name}: ${err.message}`);
      }
    }
  }
  return true;
}

// ── MAIN RUN ──────────────────────────────────────────────────────────────────
async function runBot(audience, skip = 0) {
  console.log("=".repeat(55));
  console.log(`[${audience.label}] Checking for new deals at ${new Date().toLocaleTimeString()}`);

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

  const announced = loadAnnounced(audience.seenFile);
  const unannounced = deals.filter(d => !announced.has(d.id));
  const picked = unannounced.length ? audience.pick(unannounced, skip) : null;
  const newDeals = picked ? [picked] : [];

  if (!newDeals.length) {
    console.log(`[${audience.label}] No new deals to announce.`);
    return;
  }

  // Rate limit: at most one post per SCAN_INTERVAL_MIN (with 5 min slack so
  // a post scheduled on the hour isn't skipped over a few seconds of drift).
  // Safety net against restarts/double-fires; each tier has its own clock.
  const sinceLast = Date.now() - loadLastPost(audience.lastPostFile);
  const minGap = Math.max(0, SCAN_INTERVAL_MIN - 5) * 60 * 1000;
  if (sinceLast < minGap) {
    console.log(`[${audience.label}] Last post was ${Math.round(sinceLast / 60000)} min ago — waiting for the next scheduled run.`);
    return;
  }

  console.log(`[${audience.label}] Announcing: ${newDeals[0].title.slice(0, 50)} (-${newDeals[0].discount}%)`);

  // Watchdog: if sending hangs (zombie WhatsApp session), exit so Railway
  // restarts us with a fresh connection instead of stalling silently forever.
  const watchdog = setTimeout(() => {
    console.error("Send timed out after 2 minutes - session likely dead. Exiting for restart.");
    process.exit(1);
  }, 2 * 60 * 1000);

  let sent = false;
  try {
    sent = await sendToWhatsApp(newDeals, audience.groups);
  } finally {
    clearTimeout(watchdog);
  }

  if (sent) {
    // Mark these as announced so we never repost them (per tier)
    newDeals.forEach(d => announced.add(d.id));
    saveAnnounced(audience.seenFile, announced);
    saveLastPost(audience.lastPostFile);
    console.log(`[${audience.label}] Done: announced ${newDeals.length} deal(s).`);
  }
}

// ── FIRST-RUN SEEDING ─────────────────────────────────────────────────────────
// On a tier's very first run we DON'T mark everything as announced — we want
// it to work through the existing backlog on its schedule. We just create an
// empty seen file so the seeding only happens once per tier.
async function seedIfFirstRun() {
  for (const audience of Object.values(AUDIENCES)) {
    if (!audience.groups.length || fs.existsSync(audience.seenFile)) continue;
    saveAnnounced(audience.seenFile, new Set());
    console.log(`[${audience.label}] First run: starting fresh with the existing backlog.`);
  }
}

// ── START ─────────────────────────────────────────────────────────────────────
console.log("DealsPulse WhatsApp Bot starting...");
whatsapp.initialize();

whatsapp.once("ready", async () => {
  await seedIfFirstRun();
  // No startup post — messages go out only at the scheduled times, so
  // redeploys/restarts never trigger an extra message.
  if (AUDIENCES.hourly.groups.length) {
    cron.schedule(`*/${SCAN_INTERVAL_MIN} * * * *`, () => runBot(AUDIENCES.hourly));
    console.log(`[hourly] Every ${SCAN_INTERVAL_MIN} min -> ${AUDIENCES.hourly.groups.join(", ")}`);
  }
  if (AUDIENCES.thrice.groups.length) {
    POST_SLOTS.forEach(slot =>
      cron.schedule(slot.cron, () => runBot(AUDIENCES.thrice, slot.skip), { timezone: TIMEZONE })
    );
    console.log(`[thrice-daily] ${POST_SLOTS.map(s => s.label).join(" | ")} (${TIMEZONE}) -> ${AUDIENCES.thrice.groups.join(", ")}`);
  }
  if (!AUDIENCES.hourly.groups.length && !AUDIENCES.thrice.groups.length) {
    console.warn("No groups configured — set WHATSAPP_GROUPS and/or THRICE_DAILY_GROUPS.");
  }
});
