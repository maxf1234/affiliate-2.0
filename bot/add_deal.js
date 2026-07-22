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

(function main() {
  const url   = (process.env.DEAL_URL || "").trim();
  const title = (process.env.DEAL_TITLE || "").trim();
  const priceStr = (process.env.DEAL_PRICE || "").trim();
  const origStr  = (process.env.DEAL_ORIGINAL || "").trim();
  let category   = (process.env.DEAL_CATEGORY || "").trim();
  const image    = (process.env.DEAL_IMAGE || "").trim();
  const expiresDays = parseInt(process.env.DEAL_EXPIRES_DAYS || "7", 10);

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
    image: image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
    affiliate_url: buildAffiliateUrl(url, asin),
    store: "Amazon",
    expires,
    hot: discount >= 40,
    posted_at: nowIso,
    manual: true,
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
  console.log(`  id=${deal.id}${replaced ? ` (replaced ${replaced} same-product entry)` : ""}`);
  console.log(`Total deals: ${all.length}`);
})();
