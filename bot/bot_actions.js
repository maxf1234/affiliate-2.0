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

const AFFILIATE_TAG    = process.env.AMAZON_AFFILIATE_TAG || "dealspulse02-20";
const DEALS_JSON_PATH  = path.join(__dirname, "..", "public", "deals.json");
const MAX_STORED       = 200;
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
  ["Fashion",        /\b(shirts?|t-shirts?|shoes?|pants|dress(es)?|jackets?|sneakers?|clothing|jeans|hoodies?|boots|socks|sunglasses|watch(es)?|handbags?|backpacks?|wallets?|leggings|bras?|underwear|boxer briefs?|boxers?|briefs?|coats?|hats?|caps?|scarf|scarves|gloves|slip-ons?|sandals?|loafers?|slippers?|flip[- ]flops?|apparel|footwear|skechers|crocs|adidas|reebok|puma|new balance|under armour|levis?|hanes|champion)\b/],
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

// ── SOURCE 2: savecrazydeals.com (Shopify store) ─────────────────────────────
// Deals come from the standard Shopify /products.json API (title, prices,
// image). The Amazon affiliate URL lives on each product's page, so pages
// are fetched only for NEW products, capped per run.

const SCD_BASE = "https://savecrazydeals.com";
const SCD_PAGE_FETCH_LIMIT = parseInt(process.env.SCD_PAGE_FETCH_LIMIT || "15");
const FALLBACK_IMG = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";

const sleepMs = (ms) => new Promise(r => setTimeout(r, ms));

// First real product link on the page (the site-wide Prime banner also
// points at amazon.com — filter it out).
function extractAmazonLink(html) {
  const matches = [...html.matchAll(/https:\/\/(?:www\.)?amazon\.com\/dp\/([A-Z0-9]{10})[^"'\s<)\\]*/gi)];
  for (const m of matches) {
    const url = m[0].replace(/&amp;/g, "&");
    if (/amazonprime|primeCampaignId/i.test(url)) continue;
    return { url, asin: m[1].toUpperCase() };
  }
  return null;
}

function mapShopifyProduct(p) {
  const v = (p.variants || [])[0];
  if (!v || v.available === false) return null;
  const dealPrice = parseFloat(v.price || "0");
  const origPrice = parseFloat(v.compare_at_price || "0");
  const discount = origPrice > 0 && dealPrice > 0 && origPrice > dealPrice
    ? Math.round((1 - dealPrice / origPrice) * 100)
    : 0;
  const title = (p.title || "").trim().slice(0, 120);
  if (!(dealPrice > 0) || looksLikeGarbageTitle(title)) return null;
  return {
    id: `sc_${p.id}`,
    handle: p.handle,
    title,
    dealPrice,
    originalPrice: origPrice,
    discount,
    image: (p.images && p.images[0] && p.images[0].src) || null,
  };
}

async function scrapeSaveCrazyDeals() {
  console.log("Fetching savecrazydeals.com/products.json...");
  const raw = await fetchPage(`${SCD_BASE}/products.json?limit=100`);
  let products;
  try {
    products = JSON.parse(raw).products || [];
  } catch (e) {
    throw new Error("savecrazydeals: products.json returned non-JSON — possibly blocked or changed.");
  }
  if (!products.length) {
    throw new Error("savecrazydeals: products.json returned 0 products — store empty or API changed.");
  }
  console.log(`savecrazydeals: ${products.length} products listed`);

  const existingIds = new Set(loadExisting().map(d => d.id));

  const candidates = products
    .map(mapShopifyProduct)
    .filter(c => c && c.discount >= MIN_DISCOUNT_PCT && !existingIds.has(c.id));
  console.log(`savecrazydeals: ${candidates.length} new candidates pass filters (>=${MIN_DISCOUNT_PCT}% off)`);

  // Product pages are fetched only for new candidates, politely rate-limited.
  const deals = [];
  for (const c of candidates.slice(0, SCD_PAGE_FETCH_LIMIT)) {
    try {
      const html = await fetchPage(`${SCD_BASE}/products/${c.handle}`);
      const link = extractAmazonLink(html);
      if (!link) {
        console.log(`  ${c.title.slice(0, 50)}: no Amazon link on product page — skipped`);
        continue;
      }
      deals.push({
        id: c.id,
        asin: link.asin,
        title: c.title,
        category: guessCategory(c.title),
        originalPrice: c.originalPrice,
        dealPrice: c.dealPrice,
        discount: c.discount,
        image: c.image || FALLBACK_IMG,
        affiliate_url: replaceAffiliateTag(link.url),
        store: "Amazon",
        // Shopify listings have no expiry; give them a few days, and the
        // purge/re-check cycle keeps them fresh while they stay listed.
        expires: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
        hot: c.discount >= 40,
        posted_at: new Date().toISOString(),
      });
      console.log(`  ${c.id} ${link.asin} | ${c.title.slice(0, 55)} | $${c.dealPrice} (was $${c.originalPrice}, -${c.discount}%) | ${guessCategory(c.title)}`);
      await sleepMs(400);
    } catch (e) {
      console.warn(`  ${c.title.slice(0, 50)}: product page fetch failed (${e.message})`);
    }
  }
  return deals;
}

// ── SOURCE 3: bensbargains.com ────────────────────────────────────────────────
// Deals come from JSON-LD Product blocks on the homepage (name, image, price,
// category, seller, deal-page url). We keep only offers whose seller is Amazon,
// then open the deal page to read the retail price and the direct Amazon
// product link. NOTE: Ben's routes most outbound clicks through a POST
// click-tracker rather than a plain link — those deals have no readable Amazon
// URL and are skipped (we don't try to defeat their redirector). Only deals
// that publish a real amazon.com/dp/<ASIN> link are used.

const BB_BASE = "https://bensbargains.com";
const BB_PAGE_FETCH_LIMIT = parseInt(process.env.BB_PAGE_FETCH_LIMIT || "12");
// Roundup dealboxes can list a dozen near-identical products (e.g. 12 Skechers
// styles). Cap how many we take from one box so the feed keeps some variety.
const BB_MAX_PER_BOX = parseInt(process.env.BB_MAX_PER_BOX || "3");

// Extract the numeric offer id from a deal url (…-1068066/ -> 1068066).
function extractBensDealId(url) {
  const m = (url || "").match(/-(\d{5,9})\/?$/);
  return m ? m[1] : null;
}

// JSON-LD Product blocks -> candidates sold by Amazon.
function parseBensJsonLd(html) {
  const out = [];
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let obj;
    try { obj = JSON.parse(b[1].trim()); } catch (e) { continue; }
    if (!obj || obj["@type"] !== "Product") continue;
    const offer = Array.isArray(obj.offers) ? obj.offers[0] : obj.offers;
    if (!offer) continue;
    const seller = (offer.seller && offer.seller.name) || "";
    if (!/amazon/i.test(seller)) continue;              // Amazon-sold deals only
    const price = parseFloat(offer.price);
    const dealUrl = offer.url || "";
    const id = extractBensDealId(dealUrl);
    if (!(price > 0) || !dealUrl || !id) continue;
    const image = (obj.image && (obj.image.url || obj.image)) || null;
    out.push({
      id: `bb_${id}`,
      title: (obj.name || "").trim().slice(0, 120),
      dealPrice: price,
      dealUrl,
      image: typeof image === "string" ? image : null,
      categoryHint: (offer.category && offer.category.name) || "",
    });
  }
  return out.filter(c => !looksLikeGarbageTitle(c.title));
}

// Ben's publishes its own taxonomy ("Computers / Tablets", "Home, Garden &
// Tools / Lighting"). Map it to our categories first — it's more reliable than
// title keywords — and fall back to guessing from the title.
const BENS_CATEGORY_MAP = [
  [/baby|kids|toddler|infant|nursery/i,                       "Baby & Kids"],
  [/toy|video game|board game|puzzle/i,                       "Toys & Games"],
  [/grocery|food|beverage|snack|coffee|drink/i,               "Grocery"],
  [/health|beauty|personal care|grooming|fragrance/i,         "Beauty"],
  [/clothing|apparel|shoe|footwear|jewelry|watch|handbag|accessor/i, "Fashion"],
  [/furniture|mattress|desk|chair|patio/i,                    "Furniture"],
  [/sport|outdoor|fitness|exercise|camping|bike|golf/i,       "Sports"],
  [/book|media|movie|music|magazine/i,                        "Books"],
  [/computer|tablet|laptop|electronic|tv|audio|headphone|phone|camera|gaming|monitor|storage|networking/i, "Electronics"],
  [/home|garden|tool|kitchen|lighting|appliance|bed|bath|cleaning|pet/i, "Home & Kitchen"],
];

function mapBensCategory(hint, title) {
  for (const [re, cat] of BENS_CATEGORY_MAP) {
    if (re.test(hint || "")) return cat;
  }
  return guessCategory(title);
}

// Retail ("was") price from the deal page: <span class="…price--retail…">$30</span>
function parseBensRetailPrice(html) {
  const m = html.match(/class="[^"]*price--retail[^"]*"[^>]*>[^$<]*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
}

// Fallback when no retail price is shown: "50% off" in the copy.
function parseBensPercentOff(html) {
  const m = html.match(/(\d{1,2})%\s*off/i);
  return m ? parseInt(m[1], 10) : 0;
}

// Split the listing HTML into individual <article class="dealbox …"> chunks.
function splitBensDealboxes(html) {
  const chunks = [];
  const re = /<article[^>]+class="[^"]*\bdealbox\b[^"]*"[\s\S]*?(?=<article[^>]+class="[^"]*\bdealbox\b|<\/main|$)/g;
  let m;
  while ((m = re.exec(html)) !== null) chunks.push(m[0]);
  return chunks;
}

// Ben's "roundup" deals list several products inside the description, each as
//   <a href="https://www.amazon.com/dp/ASIN?…tag=bensb407-20">Title</a> for <b>$52</b>
// The dealbox's own price element is empty for these, so parse the items
// individually — each linked product becomes its own deal.
function parseBensLinkItems(chunk) {
  const items = [];
  // The trailing price context is a LOOKAHEAD so it isn't consumed — otherwise
  // the scan would skip past the next product link in the same list.
  const re = /<a[^>]+href="(https?:\/\/(?:www\.)?amazon\.com\/(?:dp|gp\/product)\/[A-Z0-9]{10}[^"]*)"[^>]*>([\s\S]{2,160}?)<\/a>(?=([\s\S]{0,220}))/gi;
  let m;
  while ((m = re.exec(chunk)) !== null) {
    const url = m[1].replace(/&amp;/g, "&");
    if (/amazonprime|primeCampaignId/i.test(url)) continue;
    const asin = extractAsin(url);
    if (!asin) continue;
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    // Price stated right after the link ("… for <b>$52</b>")
    const after = m[3].replace(/<[^>]+>/g, " ");
    const p = after.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    items.push({ url, asin, title, dealPrice: p ? parseFloat(p[1].replace(/,/g, "")) : 0 });
  }
  return items;
}

// Build a deal from one dealbox chunk — but only when it publishes a real
// amazon.com/dp link (many deals only expose Ben's POST click-tracker).
function parseBensDealbox(chunk, jsonLdById) {
  const link = extractAmazonLink(chunk);
  if (!link) return null;

  const idMatch = chunk.match(/value="(\d{5,9})"\s+id="deal-id"/);
  const id = idMatch ? `bb_${idMatch[1]}` : `bb_${link.asin}`;
  const meta = (idMatch && jsonLdById[`bb_${idMatch[1]}`]) || null;

  // Title: JSON-LD is cleanest; else the dealbox link text.
  let title = meta ? meta.title : "";
  if (!title) {
    const t = chunk.match(/<a[^>]+class="[^"]*dealbox-link[^"]*"[^>]*>([\s\S]{3,160}?)<\/a>/);
    title = t ? t[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
  }
  if (looksLikeGarbageTitle(title)) return null;

  // Prices: JSON-LD price is authoritative; else the dealbox price element.
  let dealPrice = meta ? meta.dealPrice : 0;
  if (!dealPrice) {
    const p = chunk.match(/class="[^"]*dealbox__price(?![^"]*retail)[^"]*"[^>]*>[^$<]*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    dealPrice = p ? parseFloat(p[1].replace(/,/g, "")) : 0;
  }
  if (!(dealPrice > 0)) return null;

  const retail = parseBensRetailPrice(chunk);
  let originalPrice = retail > dealPrice ? retail : 0;
  let discount = originalPrice
    ? Math.round((1 - dealPrice / originalPrice) * 100)
    : parseBensPercentOff(chunk);
  // Derive a "was" price when only a percentage is published, so the site can
  // still show the strikethrough.
  if (!originalPrice && discount > 0 && discount < 95) {
    originalPrice = Math.round((dealPrice / (1 - discount / 100)) * 100) / 100;
  }

  // Image: JSON-LD, else the lazyload data-src (protocol-relative).
  let image = meta && meta.image;
  if (!image) {
    const im = chunk.match(/data-src="(\/\/cdn\.bensimages\.com[^"]+)"/) || chunk.match(/src="(https?:\/\/cdn\.bensimages\.com[^"]+)"/);
    image = im ? (im[1].startsWith("//") ? "https:" + im[1] : im[1]) : null;
  }

  return {
    id,
    asin: link.asin,
    title: title.slice(0, 120),
    category: mapBensCategory(meta ? meta.categoryHint : "", title),
    originalPrice: originalPrice || 0,
    dealPrice,
    discount: discount || 0,
    image: image || FALLBACK_IMG,
    affiliate_url: replaceAffiliateTag(link.url),
    store: "Amazon",
    expires: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
    hot: (discount || 0) >= 40,
    posted_at: new Date().toISOString(),
  };
}

async function scrapeBensBargains() {
  console.log("Fetching bensbargains.com...");
  const html = await fetchPage(BB_BASE);
  console.log(`Got ${html.length} bytes`);
  if (html.length < 20000) {
    throw new Error(`bensbargains page suspiciously small (${html.length} bytes) — possibly blocked.`);
  }

  // JSON-LD gives clean titles/prices/categories for the deals it covers;
  // index it so dealboxes can borrow that metadata.
  const jsonLdById = {};
  for (const c of parseBensJsonLd(html)) jsonLdById[c.id] = c;

  const boxes = splitBensDealboxes(html);
  if (!boxes.length) {
    throw new Error("bensbargains: 0 dealboxes parsed — markup may have changed.");
  }

  // Diagnostic: are there Amazon product links on the page at all, and do the
  // dealbox chunks actually contain them? Distinguishes "site hides links"
  // from "our chunking is wrong".
  const pageLinks = (html.match(/amazon\.com\/(?:dp|gp\/product)\//g) || []).length;
  const inBoxes = boxes.reduce((n, c) => n + (c.match(/amazon\.com\/(?:dp|gp\/product)\//g) || []).length, 0);
  console.log(`bensbargains: ${pageLinks} Amazon product link(s) on page, ${inBoxes} inside dealbox chunks`);

  const deals = [];
  const seen = new Set();
  let noLink = 0, noPrice = 0;

  for (const chunk of boxes) {
    const idMatch = chunk.match(/value="(\d{5,9})"\s+id="deal-id"/);
    const boxId = idMatch ? `bb_${idMatch[1]}` : null;
    const meta = (boxId && jsonLdById[boxId]) || null;

    // Chunk-level discount context (retail price or "up to N% off" copy),
    // shared by every product listed in this dealbox.
    const retail = parseBensRetailPrice(chunk);
    const pctOff = parseBensPercentOff(chunk);

    const items = parseBensLinkItems(chunk);
    if (!items.length) { noLink++; continue; }

    let usedInBox = 0;
    for (const item of items) {
      if (usedInBox >= BB_MAX_PER_BOX) break;
      if (seen.has(item.asin)) continue;

      const dealPrice = item.dealPrice || (meta ? meta.dealPrice : 0);
      if (!(dealPrice > 0)) { noPrice++; continue; }

      // Prefer the product's own link text; fall back to the dealbox title.
      let title = item.title;
      if (looksLikeGarbageTitle(title) && meta) title = meta.title;
      if (looksLikeGarbageTitle(title)) { noPrice++; continue; }

      let originalPrice = retail > dealPrice ? retail : 0;
      let discount = originalPrice
        ? Math.round((1 - dealPrice / originalPrice) * 100)
        : pctOff;
      if (!originalPrice && discount > 0 && discount < 95) {
        originalPrice = Math.round((dealPrice / (1 - discount / 100)) * 100) / 100;
      }

      let image = meta && meta.image;
      if (!image) {
        const im = chunk.match(/data-src="(\/\/cdn\.bensimages\.com[^"]+)"/) || chunk.match(/src="(https?:\/\/cdn\.bensimages\.com[^"]+)"/);
        image = im ? (im[1].startsWith("//") ? "https:" + im[1] : im[1]) : null;
      }

      seen.add(item.asin);
      usedInBox++;
      const deal = {
        // Several products can share one dealbox id, so key on the ASIN.
        id: `bb_${item.asin}`,
        asin: item.asin,
        title: title.slice(0, 120),
        category: mapBensCategory(meta ? meta.categoryHint : "", title),
        originalPrice: originalPrice || 0,
        dealPrice,
        discount: discount || 0,
        image: image || FALLBACK_IMG,
        affiliate_url: replaceAffiliateTag(item.url),
        store: "Amazon",
        expires: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
        hot: (discount || 0) >= 40,
        posted_at: new Date().toISOString(),
      };
      deals.push(deal);
      console.log(`  ${deal.id} | ${deal.title.slice(0, 55)} | $${deal.dealPrice} (was $${deal.originalPrice || "?"}, -${deal.discount}%) | ${deal.category}`);
    }
    if (!usedInBox) noPrice++;
  }

  console.log(`bensbargains: ${boxes.length} dealbox(es) -> ${deals.length} deal(s); ${noLink} click-tracker only, ${noPrice} unusable (no price/title).`);
  return deals;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
// ── SOURCE 4: slickdeals.net (RSS) ────────────────────────────────────────────
// Slickdeals' pages expose no merchant URLs (every outbound click goes through
// their redirector), but their public RSS feed publishes what we need per item:
//   data-store-slug="amazon"  data-aps-asin="B071SB82V3"
//   description: 'Amazon [amazon.com] has *Product* for *$10.99*'
//   content:encoded: <img src="https://static.slickdealscdn.com/…">
// We read the ASIN and build a clean Amazon URL with OUR tag — no redirector
// following. Items without an Amazon ASIN or a computable discount are skipped.

// Several public feeds, merged and de-duplicated by ASIN. The frontpage feed
// carries the hottest deals (all stores); the Amazon-targeted feeds return far
// more Amazon items (22/25 vs 11/25 when measured), so together they give much
// better coverage than any one feed.
// Slickdeals posts often state only the sale price ("Amazon has X for $Y"),
// with no regular price to compute a discount from — those fall below the
// normal gate. Set SD_MIN_DISCOUNT_PCT=0 to accept them anyway (more volume,
// but the site/WhatsApp show no "% off" badge for them).
const SD_MIN_DISCOUNT_PCT = parseInt(process.env.SD_MIN_DISCOUNT_PCT || String(MIN_DISCOUNT_PCT));

const SD_RSS_BASE = "https://slickdeals.net/newsearch.php";
const SD_RSS_URLS = (process.env.SD_RSS_URLS || [
  `${SD_RSS_BASE}?searcharea=deals&searchin=first&rss=1&q=amazon`,
  `${SD_RSS_BASE}?searcharea=deals&searchin=first&rss=1&store=1`,
  `${SD_RSS_BASE}?mode=frontpage&searcharea=deals&searchin=first&rss=1`,
].join(",")).split(",").map(u => u.trim()).filter(Boolean);

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

const money = (s) => parseFloat(String(s).replace(/,/g, ""));

// Pull an original ("was") price out of the deal copy. Handles the common
// Slickdeals phrasings; returns 0 when the post doesn't state one.
function parseSlickOriginalPrice(text, dealPrice) {
  const t = decodeEntities(text).replace(/\*/g, "");
  let m = t.match(/(?:reg(?:ular)?\.?|list(?:\s+price)?|orig(?:inally)?\.?|retail|was|normally|MSRP)\s*:?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (m && money(m[1]) > dealPrice) return money(m[1]);
  // "$25 off" -> original = deal + 25
  m = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*off\b/i);
  if (m && money(m[1]) > 0) return Math.round((dealPrice + money(m[1])) * 100) / 100;
  // "50% off" -> derive
  m = t.match(/(\d{1,2})%\s*off\b/i);
  if (m) {
    const pct = parseInt(m[1], 10);
    if (pct > 0 && pct < 95) return Math.round((dealPrice / (1 - pct / 100)) * 100) / 100;
  }
  return 0;
}

// Parse one <item> block into a deal candidate (or null).
function parseSlickItem(itemXml) {
  const grab = (tag) => {
    const m = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return "";
    return m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
  };

  const rawTitle = decodeEntities(grab("title"));
  const description = grab("description");
  const content = grab("content:encoded");
  const blob = `${description}\n${content}`;

  // Amazon only: the store slug/marker must say Amazon.
  const isAmazon = /data-store-slug="amazon"/i.test(content) ||
                   /\btrd=Amazon\b/i.test(content) ||
                   /^amazon\b/i.test(decodeEntities(description).trim());
  if (!isAmazon) return null;

  // ASIN: the feed's own data attribute, else a bare amazon.com/dp/… mention.
  const asinMatch = content.match(/data-aps-asin="([A-Z0-9]{10})"/i) ||
                    blob.match(/amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (!asinMatch) return null;
  const asin = asinMatch[1].toUpperCase();

  // Price: "for *$10.99*" in the copy, else the trailing "$11" in the title.
  const plain = decodeEntities(description).replace(/\*/g, "");
  let dealPrice = 0;
  let pm = plain.match(/\bfor\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (pm) dealPrice = money(pm[1]);
  if (!dealPrice) {
    pm = rawTitle.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/);
    if (pm) dealPrice = money(pm[1]);
  }
  if (!(dealPrice > 0)) return null;

  // Title: RSS titles end with the price ("… Planter $11") — trim that off.
  let title = rawTitle.replace(/\s*[-–]?\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*$/, "").trim();
  if (looksLikeGarbageTitle(title)) {
    const b = plain.match(/\bhas\s+(.+?)\s+for\s*\$/i);
    title = b ? b[1].trim() : title;
  }
  if (looksLikeGarbageTitle(title)) return null;

  const originalPrice = parseSlickOriginalPrice(blob, dealPrice);
  const discount = originalPrice > dealPrice
    ? Math.round((1 - dealPrice / originalPrice) * 100) : 0;

  const img = content.match(/<img[^>]+src="(https:\/\/static\.slickdealscdn\.com[^"]+)"/i);

  return {
    id: `sl_${asin}`,
    asin,
    title: title.slice(0, 120),
    category: guessCategory(title),
    originalPrice: originalPrice || 0,
    dealPrice,
    discount,
    image: img ? decodeEntities(img[1]) : FALLBACK_IMG,
    affiliate_url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
    store: "Amazon",
    expires: new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
    hot: discount >= 40,
    posted_at: new Date().toISOString(),
  };
}

async function scrapeSlickdeals() {
  const items = [];
  for (const url of SD_RSS_URLS) {
    try {
      const xml = await fetchPage(url);
      const found = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
      console.log(`slickdeals feed (${found.length} items): ${url.replace(SD_RSS_BASE, "…")}`);
      items.push(...found);
      await sleepMs(400);
    } catch (e) {
      console.warn(`slickdeals feed failed (${e.message}): ${url.replace(SD_RSS_BASE, "…")}`);
    }
  }
  if (!items.length) {
    throw new Error("slickdeals: 0 RSS items parsed — feeds unreachable or format changed.");
  }

  const deals = [];
  const seen = new Set();
  let notAmazon = 0, noAsin = 0, noDiscount = 0;

  for (const item of items) {
    const d = parseSlickItem(item);
    if (!d) { notAmazon++; continue; }
    if (!d.asin) { noAsin++; continue; }
    if (d.discount < SD_MIN_DISCOUNT_PCT) { noDiscount++; continue; }
    if (seen.has(d.asin)) continue;
    seen.add(d.asin);
    deals.push(d);
    console.log(`  ${d.id} | ${d.title.slice(0, 55)} | $${d.dealPrice} (was $${d.originalPrice}, -${d.discount}%) | ${d.category}`);
  }

  console.log(`slickdeals: ${items.length} RSS item(s) across ${SD_RSS_URLS.length} feed(s) -> ${deals.length} deal(s); ${notAmazon} non-Amazon/unparseable, ${noDiscount} below ${SD_MIN_DISCOUNT_PCT}% or no stated list price.`);
  return deals;
}

const SOURCES = [
  ["stundeals", scrapeStundeals],
  ["savecrazydeals", scrapeSaveCrazyDeals],
  ["bensbargains", scrapeBensBargains],
  ["slickdeals", scrapeSlickdeals],
];

module.exports = {
  parseDealObjects, guessCategory, unescapeValue, extractAsin, saveDeals,
  rebalanceHot, extractAmazonLink, mapShopifyProduct,
  parseBensJsonLd, parseBensRetailPrice, parseBensPercentOff, extractBensDealId,
  mapBensCategory, splitBensDealboxes, parseBensDealbox, parseBensLinkItems,
  parseSlickItem, parseSlickOriginalPrice, decodeEntities,
};

if (require.main === module) {
  (async () => {
    console.log("=".repeat(55));
    console.log(`DealsPulse Bot — ${new Date().toUTCString()}`);

    const collected = [];
    const failures = [];
    for (const [name, scrape] of SOURCES) {
      try {
        const deals = await scrape();
        collected.push(...deals);
        console.log(`${name}: ${deals.length} deal(s) collected`);
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
        // ::warning:: renders as an annotation on the workflow run
        console.error(`::warning::${name} scrape failed: ${e.message}`);
      }
    }

    if (process.env.DRY_RUN) {
      console.log(`DRY RUN — would pass ${collected.length} deal(s) to saveDeals; not writing deals.json.`);
    } else {
      const saved = saveDeals(collected);
      console.log(`Done: ${saved} new deal(s) saved.`);
    }

    if (failures.length === SOURCES.length) {
      console.error(`ALERT: every source failed — ${failures.join(" | ")}`);
      process.exit(1); // fail the workflow -> GitHub emails you
    }
  })();
}
