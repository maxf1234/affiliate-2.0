/**
 * Manually add a single deal to public/deals.json.
 *
 * Driven by the "Add Deal" GitHub Actions workflow (a form you fill in),
 * or runnable locally:
 *   DEAL_URL=... DEAL_TITLE=... DEAL_PRICE=... node bot/add_deal.js
 *
 * Reuses the scraper's category guessing + ASIN extraction, applies your
 * affiliate tag, and prepends the deal (newest-first) with a man_ id so it
 * shows up on the site and in the WhatsApp queue immediately. If a deal with
 * the same ASIN already exists, it's replaced by this manual one.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { guessCategory, extractAsin } = require("./bot_actions.js");

const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "dealspulse02-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_STORED      = 200;

const VALID_CATEGORIES = new Set([
  "Electronics", "Baby & Kids", "Toys & Games", "Grocery", "Beauty",
  "Home & Kitchen", "Fashion", "Sports", "Furniture", "Books", "General",
]);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const FALLBACK_IMG = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";

// Fetch a URL (following redirects) as text. Resolves null on any failure so
// image lookup is always best-effort and never blocks adding the deal.
function fetchText(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve(null);
    let lib;
    try { lib = url.startsWith("https") ? https : http; } catch (e) { return resolve(null); }
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        res.resume();
        return fetchText(next, redirects + 1).then(resolve);
      }
      let data = "";
      res.on("data", c => { data += c; if (data.length > 2_000_000) req.destroy(); });
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

// Best-effort scrape of an Amazon product image from the page.
async function findAmazonImage(url) {
  const html = await fetchText(url);
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /"hiRes":"(https:[^"]+?\.jpg)"/i,
    /"large":"(https:\/\/m\.media-amazon\.com[^"]+?\.jpg)"/i,
    /id="landingImage"[^>]+src=["']([^"']+)["']/i,
    /data-old-hires=["'](https:[^"']+?\.jpg)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && /^https?:\/\//.test(m[1]) && !/sprite|grey-pixel|transparent/i.test(m[1])) {
      return m[1].replace(/\\u002[fF]/g, "/").replace(/&amp;/g, "&");
    }
  }
  return null;
}

function buildAffiliateUrl(rawUrl, asin) {
  // Canonical, clean affiliate URL when we know the ASIN.
  if (asin) return `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`;
  // Otherwise keep the given URL and force our tag onto it.
  try {
    const u = new URL(rawUrl);
    u.searchParams.set("tag", AFFILIATE_TAG);
    return u.toString();
  } catch (e) {
    return rawUrl;
  }
}

(async function main() {
  const url   = (process.env.DEAL_URL || "").trim();
  const title = (process.env.DEAL_TITLE || "").trim();
  const priceStr = (process.env.DEAL_PRICE || "").trim();
  const origStr  = (process.env.DEAL_ORIGINAL || "").trim();
  let category   = (process.env.DEAL_CATEGORY || "").trim();
  let image      = (process.env.DEAL_IMAGE || "").trim();
  const expiresDays = parseInt(process.env.DEAL_EXPIRES_DAYS || "7", 10);
  const priority = /^(1|true|yes)$/i.test((process.env.DEAL_PRIORITY || "").trim());

  // ── Validate ──
  if (!url) fail("DEAL_URL is required (the Amazon product link).");
  if (!/amazon\.com|amzn\.to/i.test(url)) fail("DEAL_URL must be an amazon.com or amzn.to link.");
  if (!title || title.length < 3) fail("DEAL_TITLE is required (at least 3 characters).");

  const dealPrice = parseFloat(priceStr);
  if (!(dealPrice > 0)) fail("DEAL_PRICE must be a number greater than 0, e.g. 24.99.");

  const originalPrice = origStr ? parseFloat(origStr) : 0;
  if (origStr && !(originalPrice > 0)) fail("DEAL_ORIGINAL, if given, must be a number greater than 0.");
  if (originalPrice && originalPrice < dealPrice) {
    fail(`DEAL_ORIGINAL ($${originalPrice}) should be higher than DEAL_PRICE ($${dealPrice}).`);
  }

  if (!category || category.toLowerCase() === "auto") {
    category = guessCategory(title);
  } else if (!VALID_CATEGORIES.has(category)) {
    console.warn(`Unknown category "${category}" — using it as-is.`);
  }

  const asin = extractAsin(url);

  // Auto-find the product image if none was given (best-effort; Amazon is
  // reachable from GitHub Actions runners). Falls back to a generic image.
  if (!image) {
    process.stdout.write("No image given — trying to fetch from Amazon... ");
    const found = await findAmazonImage(url);
    if (found) { image = found; console.log("found."); }
    else { console.log("none found, using placeholder."); }
  }

  const discount = originalPrice > 0 && originalPrice > dealPrice
    ? Math.round((1 - dealPrice / originalPrice) * 100)
    : 0;

  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + Math.max(1, expiresDays) * 86400000)
    .toISOString().split("T")[0];

  const deal = {
    id: asin ? `man_${asin}` : `man_${Date.now()}`,
    asin: asin || null,
    title: title.slice(0, 120),
    category,
    originalPrice: originalPrice || 0,
    dealPrice,
    discount,
    image: image || FALLBACK_IMG,
    affiliate_url: buildAffiliateUrl(url, asin),
    store: "Amazon",
    expires,
    hot: discount >= 40,
    posted_at: nowIso,
    manual: true,
    ...(priority ? { priority: true } : {}),
  };

  // ── Merge into deals.json ──
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(DEALS_JSON_PATH, "utf8"));
  } catch (e) { /* start empty if unreadable */ }

  // Drop any existing entry with the same id or ASIN so the manual one wins.
  const before = existing.length;
  existing = existing.filter(d => {
    if (d.id === deal.id) return false;
    if (deal.asin && (d.asin === deal.asin || extractAsin(d.affiliate_url || "") === deal.asin)) return false;
    return true;
  });
  const replaced = before - existing.length;

  const all = [deal, ...existing]
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
    .slice(0, MAX_STORED);

  fs.mkdirSync(path.dirname(DEALS_JSON_PATH), { recursive: true });
  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(all, null, 2));

  console.log("Added deal:");
  console.log(`  ${deal.title}`);
  console.log(`  $${deal.dealPrice}${originalPrice ? ` (was $${originalPrice}, -${discount}%)` : ""} | ${category}`);
  console.log(`  ${deal.affiliate_url}`);
  console.log(`  image: ${deal.image === FALLBACK_IMG ? "placeholder" : deal.image.slice(0, 80)}`);
  console.log(`  id=${deal.id}${priority ? " [PRIORITY — posts next on WhatsApp]" : ""}${replaced ? ` (replaced ${replaced} same-product entry)` : ""}`);
  console.log(`Total deals: ${all.length}`);
})();
