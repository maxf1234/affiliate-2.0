/**
 * Affiliate click redirect + tracker
 * URL: /api/go?id=<dealId>&src=<site|deal|share|wa>
 *
 * Every "Buy on Amazon" link routes through here so clicks are counted
 * per deal, per source channel, and per day — then the visitor is
 * 302-redirected to the Amazon affiliate URL.
 *
 * Counting uses Upstash Redis via REST (add the free Upstash integration
 * in Vercel: Storage → Upstash → Redis). Without it, clicks are only
 * logged to the function logs and the redirect still works.
 */

const https = require("https");

const DEALS_URL = "https://raw.githubusercontent.com/maxf1234/affiliate-2.0/main/public/deals.json";
const VALID_SRC = new Set(["site", "deal", "share", "wa"]);

// Prime Student referral — not a deals.json entry, tracked under id "prime"
const PRIME_REFERRAL_URL = "https://amzn.to/4vIChX1";
const PRIME_PSEUDO_DEAL = { id: "prime", title: "Amazon Prime 6-month free trial (18-24)" };

// Cache deals across warm invocations so redirects stay fast
let dealsCache = { data: null, at: 0 };

function fetchDeals() {
  if (dealsCache.data && Date.now() - dealsCache.at < 60_000) {
    return Promise.resolve(dealsCache.data);
  }
  return new Promise((resolve) => {
    https.get(DEALS_URL, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const deals = JSON.parse(data);
          dealsCache = { data: deals, at: Date.now() };
          resolve(deals);
        } catch (e) { resolve(dealsCache.data || []); }
      });
    }).on("error", () => resolve(dealsCache.data || []));
  });
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function trackClick(deal, src) {
  const day = new Date().toISOString().split("T")[0];
  console.log(`click deal=${deal.id} src=${src} title="${deal.title.slice(0, 60)}"`);

  const redis = redisConfig();
  if (!redis) return;

  const commands = [
    ["INCR", "clicks:total"],
    ["INCR", `clicks:src:${src}`],
    ["INCR", `clicks:day:${day}`],
    ["INCR", `clicks:deal:${deal.id}`],
    ["ZINCRBY", "clicks:leaderboard", "1", deal.id],
    ["HSET", "deal:titles", deal.id, deal.title.slice(0, 90)],
  ];

  try {
    await fetch(`${redis.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}` },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {
    console.error("click tracking failed:", e.message);
  }
}

// Link-preview crawlers (WhatsApp, Facebook, etc.) fetch URLs before any
// human taps them — don't count those as clicks.
function isPreviewBot(req) {
  const ua = req.headers["user-agent"] || "";
  return /whatsapp|facebookexternalhit|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|preview|crawler|spider/i.test(ua);
}

module.exports = async (req, res) => {
  const { id } = req.query;
  const src = VALID_SRC.has(req.query.src) ? req.query.src : "site";
  // to=site: count the click, then land on OUR deal page instead of Amazon.
  // Used by the WhatsApp bot so group-member taps are measurable.
  const toSite = req.query.to === "site";

  res.setHeader("Cache-Control", "no-store");

  // Prime referral clicks: count under "prime", straight to the referral link
  if (id === "prime") {
    if (!isPreviewBot(req)) await trackClick(PRIME_PSEUDO_DEAL, src);
    res.writeHead(302, { Location: PRIME_REFERRAL_URL });
    res.end();
    return;
  }

  const deals = await fetchDeals();
  const deal = deals.find(d => d.id === id);

  res.setHeader("Cache-Control", "no-store");

  if (!deal || !deal.affiliate_url) {
    // Deal rotated off the site (old WhatsApp message, stale link):
    // send the visitor to the homepage instead of a dead end.
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  if (!isPreviewBot(req)) {
    await trackClick(deal, src);
  }

  const target = toSite
    ? "/#/deal/" + encodeURIComponent(deal.id) + "?src=" + src
    : deal.affiliate_url;
  res.writeHead(302, { Location: target });
  res.end();
};
