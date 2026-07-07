/**
 * DealsPulse Bot — stundeals.com scraper
 * Parses individual deal objects from embedded Next.js JSON data.
 *
 * Quality gates:
 *   - Only Amazon deals with a valid price AND >= MIN_DISCOUNT_PCT off
 *   - Titles are properly unescaped (no more `3\\\\` artifacts)
 *   - Expired deals are purged from deals.json on every run
 *   - Duplicate products (same ASIN under a new deal id) are skipped
 *
 * Exit codes:
 *   0 = ok (even if no new deals)
 *   1 = page fetched fine but ZERO deals parsed -> stundeals likely changed
 *       their markup; the GitHub Action fails so you get an email alert.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const AFFILIATE_TAG    = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH  = path.join(__dirname, "..", "public", "deals.json");
const MAX_STORED       = 60;
const MIN_DISCOUNT_PCT = parseInt(process.env.MIN_DISCOUNT_PCT || "25");
const MAX_PER_RUN      = parseInt(process.env.MAX_DEALS_PER_RUN || "25");

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        return fetchPage(next).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// The deal JSON lives inside a JS string literal in the page, so every value
// is double-escaped (JSON inside a JS string). Two JSON.parse passes undo
// both layers; falls back to manual replacement if a chunk is truncated.
function unescapeValue(raw) {
  try {
    let s = JSON.parse('"' + raw + '"');       // undo JS-string layer
    if (s.includes("\\")) {
      try { s = JSON.parse('"' + s + '"'); }   // undo JSON layer
      catch (e) { /* keep single-pass result */ }
    }
    return s;
  } catch (e) {
    return raw
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\\\/g, "\\")
      .replace(/\\"/g, '"');
  }
}

function replaceAffiliateTag(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("tag", AFFILIATE_TAG);
    return u.toString();
  } catch (e) {
    return url;
  }
}

function extractAsin(url) {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

// Word-boundary matching so e.g. "Portable" no longer matches /table/.
// First matching rule wins, so more specific categories come first.
const CATEGORY_RULES = [
  ["Electronics",    /\b(laptops?|phones?|smartphones?|tv|tvs|headphones?|earbuds?|speakers?|soundbars?|cameras?|tablets?|xbox|playstation|nintendo|ipads?|macbooks?|airpods?|monitors?|routers?|ssd|hdd|gpu|chargers?|cables?|bluetooth|power station|power bank|smartwatch|kindle|echo|alexa|drones?|projectors?|keyboards?|mouse|webcams?|microphones?|printers?|usb|gps)\b/],
  ["Baby & Kids",    /\b(baby|toddler|infant|car seats?|strollers?|diapers?|cribs?|pacifiers?|onesies?|nursery|bottle warmers?|high chairs?|playpens?)\b/],
  ["Toys & Games",   /\b(toys?|lego|board games?|puzzles?|playmobil|kinetic|dolls?|action figures?|nerf|hot wheels|monopoly|plush|rc car)\b/],
  ["Grocery",        /\b(spring water|sparkling water|cereal|coffee pods?|k-cups?|snacks?|chips|candy|chocolate|protein bars?|energy drinks?|soda|juice|pasta|sauce|oatmeal|granola|nuts|cookies?|crackers?)\b/],
  ["Beauty",         /\b(beauty|skincare|makeup|shampoo|conditioner|perfumes?|cologne|toothpaste|toothbrush(es)?|deodorants?|lotions?|serums?|moisturizers?|hair dryers?|straighteners?|razors?|nail|body wash|soap|sunscreen|hand sanitizer)\b/],
  ["Home & Kitchen", /\b(kitchen|cookware|instant pot|air fryers?|blenders?|coffee|espresso|vacuums?|dyson|bedding|sheets|pillows?|towels?|pans?|pots?|grills?|cookers?|ovens?|juicers?|toasters?|stockpots?|tumblers?|water bottles?|mugs?|knife|knives|cutting boards?|storage|organizers?|cleaners?|detergents?|toilet paper|trash bags?|humidifiers?|purifiers?|lamps?|curtains?|rugs?|mattress(es)?|kettles?|choppers?|dinnerware|steel wool|tissues?|blankets?|hooks?|ice machine|shave ice|mops?|brooms?|dish|sponges?|foil|containers?|canisters?|thermos)\b/],
  ["Fashion",        /\b(shirts?|t-shirts?|shoes?|pants|dress(es)?|jackets?|sneakers?|clothing|jeans|hoodies?|boots|socks|sunglasses|watch(es)?|handbags?|backpacks?|wallets?|leggings|bras?|underwear|boxer briefs?|boxers?|briefs?|coats?|hats?|caps?|scarf|scarves|gloves)\b/],
  ["Sports",         /\b(sports?|fitness|gym|bikes?|bicycles?|yoga|running|golf|pool|camping|tents?|hiking|dumbbells?|treadmills?|basketball|soccer|tennis|fishing|kayaks?|scooters?|coolers?|wagons?|beach|outdoor)\b/],
  ["Furniture",      /\b(chairs?|desks?|furniture|whiteboards?|sofas?|couch(es)?|tables?|bookshelf|bookshelves|shelf|shelves|shelving|cabinets?|dressers?|nightstands?|ottomans?|bench(es)?|stools?|patio)\b/],
  ["Books",          /\b(books?|audible|novels?|paperback|hardcover)\b/],
];

function guessCategory(name) {
  const t = " " + (name || "").toLowerCase() + " ";
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(t)) return cat;
  }
  return "General";
}

function looksLikeGarbageTitle(title) {
  if (!title || title.length < 8) return true;
  if (title.includes("\\")) return true;             // unescaping failed
  if (!/[a-zA-Z]{3}/.test(title)) return true;       // no real words
  return false;
}

function parseDealObjects(html) {
  const deals = [];
  const seen = new Set();

  // Each deal appears as JSON double-escaped inside a JS string literal:
  //   \"id\":NUMBER,\"name\":\"TITLE\"
  // Inside TITLE, a quote is \\\" and a backslash is \\\\ — both must be
  // consumed as units so the lazy match doesn't stop at an escaped quote
  // (that's what produced titles like `12 Pack Sticky Notes 3\\`).
  // Value tokens: \\\" (escaped quote) | \\\\ (escaped backslash) |
  //               \\x (JSON escape like \n) | \x (JS escape like &) | plain
  const STR = String.raw`((?:\\\\\\"|\\\\\\\\|\\\\[^"\\]|\\[^"\\]|[^"\\])*?)`;
  const dealStartRegex = new RegExp(String.raw`\\"id\\":(\d{4,7}),\\"name\\":\\"` + STR + String.raw`\\"`, "g");
  const linkRegex = new RegExp(String.raw`\\"link\\":\\"` + STR + String.raw`\\"`);
  let match;

  while ((match = dealStartRegex.exec(html)) !== null) {
    const dealId = match[1];
    const dealName = unescapeValue(match[2]).trim();

    if (seen.has(dealId)) continue;
    if (dealName === "viewport" || dealName === "description") continue;
    if (looksLikeGarbageTitle(dealName)) continue;

    const chunkStart = match.index;
    const chunkEnd = Math.min(chunkStart + 2500, html.length);
    const chunk = html.slice(chunkStart, chunkEnd);

    const linkMatch = chunk.match(linkRegex);
    if (!linkMatch) continue;
    const link = unescapeValue(linkMatch[1]);

    if (!link.includes("amazon.com") && !link.includes("amzn.to")) continue;

    const priceMatch = chunk.match(/\\"price\\":\\"(\d+\.?\d*)\\"/);
    const origPriceMatch = chunk.match(/\\"originalPrice\\":\\"(\d+\.?\d*)\\"/);

    const dealPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
    const origPrice = origPriceMatch ? parseFloat(origPriceMatch[1]) : 0;

    const picMatch = chunk.match(/\\"marketplacePictures\\":\[\\"(https:[^\\]+)\\"/);
    const image = picMatch ? unescapeValue(picMatch[1]) : null;

    const expiredMatch = chunk.match(/\\"expired\\":\\"([^\\]+)\\"/);
    let expires = null;
    if (expiredMatch) {
      const parts = expiredMatch[1].split("/");
      if (parts.length === 3) {
        expires = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }
    if (!expires) {
      expires = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    }

    const flagsMatch = chunk.match(/\\"flags\\":\[(.*?)\]/);
    const isHot = flagsMatch
      ? flagsMatch[1].toLowerCase().includes("lowest") || flagsMatch[1].toLowerCase().includes("prime")
      : false;

    const affiliateUrl = replaceAffiliateTag(link);

    const discount = origPrice > 0 && dealPrice > 0 && origPrice > dealPrice
      ? Math.round((1 - dealPrice / origPrice) * 100)
      : 0;

    seen.add(dealId);

    deals.push({
      id: `sd_${dealId}`,
      asin: extractAsin(affiliateUrl),
      title: dealName.slice(0, 120),
      category: guessCategory(dealName),
      originalPrice: origPrice,
      dealPrice: dealPrice,
      discount: discount,
      image: image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
      affiliate_url: affiliateUrl,
      store: "Amazon",
      expires: expires,
      hot: isHot || discount >= 40,
      posted_at: new Date().toISOString(),
    });
  }

  return deals;
}

function isExpired(deal, todayStr) {
  return deal.expires && deal.expires < todayStr;
}

// "Hot" is relative, not a fixed threshold: only the top ~15% of stored
// deals by discount (at least 3) get the badge. A fixed cutoff made half
// the site "hot", which means nothing to visitors.
function rebalanceHot(deals) {
  const hotCount = Math.max(3, Math.round(deals.length * 0.15));
  const cutoff = [...deals]
    .sort((a, b) => b.discount - a.discount)
    .map(d => d.discount)[hotCount - 1] || Infinity;
  return deals.map(d => ({ ...d, hot: d.discount >= cutoff && d.discount > 0 }));
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(DEALS_JSON_PATH, "utf8"));
  } catch (e) {
    return [];
  }
}

function saveDeals(newDeals) {
  const todayStr = new Date().toISOString().split("T")[0];
  const existing = loadExisting();

  // Purge expired deals so visitors never land on a dead/full-price link
  const fresh = existing.filter(d => !isExpired(d, todayStr));
  const purged = existing.length - fresh.length;
  if (purged) console.log(`Purged ${purged} expired deal(s).`);

  const existingIds = new Set(fresh.map(d => d.id));
  const existingAsins = new Set(fresh.map(d => d.asin || extractAsin(d.affiliate_url || "")).filter(Boolean));

  let skippedId = 0, skippedAsin = 0;
  const additions = newDeals.filter(d => {
    if (existingIds.has(d.id)) { skippedId++; return false; }
    if (d.asin && existingAsins.has(d.asin)) { skippedAsin++; return false; } // same product, new deal id
    return true;
  }).slice(0, MAX_PER_RUN); // cap NEW deals per run — here, not at parse time,
                            // so deals low on the page still get saved eventually
  console.log(`Dedupe: ${skippedId} already stored, ${skippedAsin} duplicate products, ${additions.length} genuinely new.`);

  const allDeals = rebalanceHot(
    [...additions, ...fresh]
      .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
      .slice(0, MAX_STORED)
  );

  const changed = additions.length > 0 || purged > 0;
  if (!changed) {
    console.log("No changes to save.");
    return 0;
  }

  fs.mkdirSync(path.dirname(DEALS_JSON_PATH), { recursive: true });
  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(allDeals, null, 2));
  console.log(`Saved: +${additions.length} new, -${purged} expired. Total: ${allDeals.length}`);
  return additions.length;
}

async function scrapeStundeals() {
  console.log("Fetching stundeals.com...");
  const html = await fetchPage("https://www.stundeals.com");
  console.log(`Got ${html.length} bytes`);

  if (html.length < 10000) {
    throw new Error(`Page suspiciously small (${html.length} bytes) — possibly blocked.`);
  }

  const allDeals = parseDealObjects(html);

  if (!allDeals.length) {
    // Page loaded but nothing parsed: markup almost certainly changed.
    throw new Error("Page fetched OK but 0 deals parsed — stundeals markup may have changed.");
  }

  const valid = allDeals.filter(d => d.dealPrice > 0 && d.discount >= MIN_DISCOUNT_PCT);
  console.log(`Parsed ${allDeals.length} Amazon deals; ${valid.length} pass filters (price>0, >=${MIN_DISCOUNT_PCT}% off)`);
  valid.forEach(d =>
    console.log(`  ${d.id} ${d.asin || "no-asin"} | ${d.title.slice(0, 55)} | $${d.dealPrice} (was $${d.originalPrice}, -${d.discount}%) | ${d.category}`)
  );

  // Return everything valid — the per-run cap on NEW deals is applied in
  // saveDeals, after dedupe. Capping here made deals below position
  // MAX_PER_RUN on the page invisible forever once the top was all known.
  return valid;
}

module.exports = { parseDealObjects, guessCategory, unescapeValue, extractAsin, saveDeals, rebalanceHot };

if (require.main === module) {
  (async () => {
    console.log("=".repeat(55));
    console.log(`DealsPulse Bot — ${new Date().toUTCString()}`);
    try {
      const deals = await scrapeStundeals();
      const saved = saveDeals(deals);
      console.log(`Done: ${saved} new deal(s) saved.`);
    } catch (e) {
      if (e.message.includes("0 deals parsed") || e.message.includes("suspiciously small")) {
        console.error(`ALERT: ${e.message}`);
        process.exit(1); // fail the workflow -> GitHub emails you
      }
      // Transient network problems shouldn't spam failure emails every hour
      console.error(`Scrape failed (transient): ${e.message}`);
    }
  })();
}
