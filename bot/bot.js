/**
 * DealsPulse WhatsApp Bot — Baileys
 * =================================
 * Reads deals from your LIVE site's deals.json (the single source of truth,
 * maintained by GitHub Actions), tracks which deals it has already announced,
 * and posts any NEW deals to your WhatsApp group(s) from YOUR number.
 *
 * Uses Baileys (@whiskeysockets/baileys): a protocol-level WhatsApp client —
 * NO browser/puppeteer — so it doesn't break every time WhatsApp updates the
 * web app (which is what killed the old whatsapp-web.js version).
 *
 * RUN:
 *   node bot.js
 *   First run: set WHATSAPP_PHONE to link by pairing code, or scan the QR.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const cron = require("node-cron");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");

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
// Which deal categories the thrice-daily tier may post (comma-separated).
const THRICE_DAILY_CATEGORIES = parseGroups(process.env.THRICE_DAILY_CATEGORIES || "Fashion");

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
    memory: new Set(),                             // in-process backup of announced ids
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
    categories: THRICE_DAILY_CATEGORIES, // only deals from these categories
    memory: new Set(),                   // in-process backup of announced ids
    seenFile: dataFile("announced_thrice.json"),
    lastPostFile: dataFile("last_post_thrice.json"),
    // best-first by discount; skip holds the top deal(s) back for 9 PM
    pick(unannounced, skip = 0) {
      unannounced.sort((a, b) => (b.discount || 0) - (a.discount || 0));
      return unannounced[Math.min(skip, unannounced.length - 1)];
    },
  },
};

// ── WHATSAPP (Baileys) ─────────────────────────────────────────────────────────
// Auth (creds + signal keys) live on the persistent volume so relinking is
// only needed when WhatsApp itself logs the session out.
const AUTH_DIR = process.env.AUTH_DIR || (IS_MAC ? path.join(__dirname, "baileys_auth") : "/data/baileys_auth");

// Set WHATSAPP_PHONE (digits only, with country code, e.g. 15551234567) to
// link by typing an 8-character code on your phone instead of scanning a QR:
// WhatsApp -> Linked Devices -> Link a Device -> "Link with phone number instead"
const WHATSAPP_PHONE = (process.env.WHATSAPP_PHONE || "").replace(/[^\d]/g, "");

// Baileys wants a pino-like logger; a silent no-op keeps logs clean.
const logger = {
  level: "silent",
  child: () => logger,
  trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
};

let sock = null;
let whatsappReady = false;
let onReadyDone = false;
let pairingRequested = false;

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    console.warn(`Could not fetch latest WA version (${e.message}); using bundled default.`);
  }

  sock = makeWASocket({
    auth: state,
    version,
    logger,
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  // Pairing-code login (no QR) when this device isn't linked yet.
  if (WHATSAPP_PHONE && !sock.authState.creds.registered && !pairingRequested) {
    pairingRequested = true;
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(WHATSAPP_PHONE);
        console.log("\n==============================================");
        console.log(`  PAIRING CODE: ${code}`);
        console.log("  On your phone: WhatsApp -> Linked Devices ->");
        console.log("  Link a Device -> 'Link with phone number instead'");
        console.log("==============================================\n");
      } catch (e) {
        console.error(`Pairing code request failed (${e.message}) — a QR will be printed instead.`);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !WHATSAPP_PHONE) {
      console.log("\nScan this QR code with your WhatsApp:\n");
      qrcode.generate(qr, { small: true });
      console.log("\nWhatsApp -> Linked Devices -> Link a Device\n");
    }

    if (connection === "open") {
      whatsappReady = true;
      console.log("WhatsApp connected - messages will send from your number!");
      if (!onReadyDone) {
        onReadyDone = true;
        await onReady();
      }
    } else if (connection === "close") {
      whatsappReady = false;
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode : undefined;
      if (code === DisconnectReason.loggedOut) {
        console.error("Logged out by WhatsApp. Delete the auth volume (/data/baileys_auth) and relink.");
        process.exit(1);
      }
      console.warn(`Connection closed (code ${code}). Reconnecting in 5s...`);
      setTimeout(() => { connectWhatsApp().catch(e => console.error("Reconnect failed:", e.message)); }, 5000);
    }
  });
}

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
// A configured group can be given as a name substring OR a raw group id
// (…@g.us). Ids need no lookup at all.
const isGroupId = (s) => /@g\.us$/.test(s.trim());

// List all groups this account participates in — a protocol call, not a
// browser scrape, so it's reliable across WhatsApp web-app changes.
async function fetchGroups() {
  const meta = await sock.groupFetchAllParticipating();
  return Object.values(meta).map(g => ({ id: g.id, name: g.subject || "" }));
}

// Resolve configured names/ids to concrete @g.us ids, cached across runs.
const resolvedGroupCache = new Map();

async function resolveGroupIds(groupNames) {
  const out = new Set();
  const needLookup = [];
  for (const raw of groupNames) {
    const g = raw.trim();
    if (isGroupId(g)) out.add(g);
    else if (resolvedGroupCache.has(g.toLowerCase())) out.add(resolvedGroupCache.get(g.toLowerCase()));
    else needLookup.push(g);
  }

  if (needLookup.length) {
    let groups = [];
    try {
      groups = await fetchGroups();
    } catch (e) {
      console.warn(`Group lookup failed (${e.message}).`);
    }
    for (const name of needLookup) {
      const match = groups.find(g => g.name.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        resolvedGroupCache.set(name.toLowerCase(), match.id);
        out.add(match.id);
      } else {
        console.warn(`No group matched "${name}". Available: ${groups.map(g => g.name).join(", ")}`);
      }
    }
  }
  return [...out];
}

async function sendToWhatsApp(deals, groupNames) {
  if (!whatsappReady || !sock) {
    console.warn("WhatsApp not ready - skipping.");
    return false;
  }

  const groupIds = await resolveGroupIds(groupNames);
  if (!groupIds.length) {
    console.warn(`No WhatsApp groups resolved from [${groupNames.join(", ")}]. Set names or @g.us ids in the group variables.`);
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

    for (const groupId of groupIds) {
      try {
        // Try to send as image with caption; fall back to plain text.
        let sent = false;
        if (deal.image && deal.image.startsWith("http")) {
          try {
            await sock.sendMessage(groupId, { image: { url: deal.image }, caption });
            sent = true;
          } catch (imgErr) {
            console.warn(`Image send failed, falling back to text: ${imgErr.message}`);
          }
        }

        if (!sent) {
          await sock.sendMessage(groupId, { text: caption });
        }

        console.log(`Sent: ${deal.title.slice(0, 45)} -> ${groupId}`);
        await sleep(3000);
      } catch (err) {
        console.error(`Failed to send to ${groupId}: ${err.message}`);
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

  // Union of the on-disk history and the in-process memory: if the volume
  // is missing/read-only, the memory still prevents re-posting the same
  // deal every run for as long as the process lives.
  const announced = loadAnnounced(audience.seenFile);
  audience.memory.forEach(id => announced.add(id));
  let unannounced = deals.filter(d => !announced.has(d.id));
  if (audience.categories && audience.categories.length) {
    const wanted = audience.categories.map(c => c.toLowerCase());
    unannounced = unannounced.filter(d => wanted.includes((d.category || "").toLowerCase()));
  }
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

  // Watchdog: if sending hangs, exit so Railway restarts us with a fresh
  // connection instead of stalling silently forever.
  const watchdog = setTimeout(() => {
    console.error("Send timed out after 2 minutes - exiting for restart.");
    process.exit(1);
  }, 2 * 60 * 1000);

  let sent = false;
  try {
    sent = await sendToWhatsApp(newDeals, audience.groups);
  } catch (e) {
    // Without this catch a send failure becomes an unhandled rejection:
    // the process dies (or the error vanishes) with nothing in the logs.
    const detail = String((e && (e.stack || e.message)) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400);
    console.error(`[${audience.label}] Send failed: ${detail}`);
  } finally {
    clearTimeout(watchdog);
  }

  if (sent) {
    // Mark these as announced so we never repost them (per tier) — both
    // in the persistent file and in process memory as a fallback.
    newDeals.forEach(d => { announced.add(d.id); audience.memory.add(d.id); });
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

// ── ON READY (runs once, first time the socket connects) ───────────────────────
async function onReady() {
  await seedIfFirstRun();

  // One-time diagnostic: list every group with its @g.us id, so you can
  // paste ids into WHATSAPP_GROUPS / THRICE_DAILY_GROUPS.
  console.log("=== AVAILABLE GROUPS ===");
  try {
    const groups = await fetchGroups();
    groups.forEach(g => console.log(`GROUP: "${g.name}" => ${g.id}`));
  } catch (e) {
    console.warn(`Could not list groups at startup: ${e.message}`);
  }
  console.log("=== END GROUPS ===");

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
}

// ── START ─────────────────────────────────────────────────────────────────────
// The announced-history and login session live on the persistent volume.
// If it's missing or read-only, say so LOUDLY at startup instead of
// silently re-posting the same deal every run.
function checkVolumeWritable() {
  const probe = dataFile(".volume_probe");
  try {
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    console.log(`Persistent storage OK (${path.dirname(probe)}).`);
  } catch (e) {
    console.error("!".repeat(60));
    console.error(`PERSISTENT VOLUME NOT WRITABLE: ${e.message}`);
    console.error("Announced-deal history / login will NOT survive restarts.");
    console.error("Fix: Railway -> service -> Settings -> attach a Volume mounted at /data");
    console.error("!".repeat(60));
  }
}

console.log("DealsPulse WhatsApp Bot starting...");
checkVolumeWritable();
connectWhatsApp().catch(e => {
  console.error("Fatal: could not start WhatsApp connection:", e.message);
  process.exit(1);
});
