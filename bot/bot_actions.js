/**
 * DealsPulse Bot — stundeals.com scraper (fixed parsing)
 * Parses individual deal objects from embedded Next.js JSON data
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_STORED      = 50;
const STUNDEALS_TAG   = "stundeals0d-20";

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

function replaceAffiliateTag(url) {
  try {
    const u = new URL(url);
    if (u.searchParams.get("tag")) {
      u.searchParams.set("tag", AFFILIATE_TAG);
    }
    return u.toString();
  } catch (e) {
    return url.replace(STUNDEALS_TAG, AFFILIATE_TAG);
  }
}

function guessCategory(name) {
  const t = (name || "").toLowerCase();
  if (t.match(/laptop|phone|tv|headphone|speaker|camera|tablet|xbox|playstation|nintendo|ipad|macbook|airpod|monitor|router|ssd|gpu|battery|charger|cable|earbuds|bluetooth/)) return "Electronics";
  if (t.match(/shirt|shoe|pants|dress|jacket|sneaker|clothing|fashion|jeans|hoodie|boots|socks|sunglasses/)) return "Fashion";
  if (t.match(/kitchen|cookware|instant pot|air fryer|blender|coffee|vacuum|dyson|bedding|towel|pot|pan|grill|cooker|oven|juicer|toaster|stockpot|tumbler|water bottle/)) return "Home & Kitchen";
  if (t.match(/book|kindle|audible/)) return "Books";
  if (t.match(/toy|lego|game|gaming|puzzle|playmobil|kinetic|rocking|walker|monopoly/)) return "Toys & Games";
  if (t.match(/beauty|skincare|makeup|shampoo|perfume|cologne|toothpaste|deodorant/)) return "Beauty";
  if (t.match(/sport|fitness|gym|bike|yoga|running|golf|pool|fan/)) return "Sports";
  if (t.match(/chair|desk|furniture|whiteboard|sofa|table/)) return "Furniture";
  return "General";
}

function parseDealObjects(html) {
  const deals = [];
  const seen = new Set();

  // Find each deal by looking for the escaped JSON pattern:
  // \"id\":NUMBER,\"name\":\"TITLE\"
  // Then extract ALL fields for that specific deal from the chunk that follows
  const dealStartRegex = /\\"id\\":(\d{4,6}),\\"name\\":\\"((?:[^\\]|\\[^"])*)\\"/g;
  let match;

  while ((match = dealStartRegex.exec(html)) !== null) {
    const dealId = match[1];
    const dealName = match[2];

    // Skip duplicates (same deal appears in multiple sections)
    if (seen.has(dealId)) continue;

    // Skip non-product entries (like viewport meta)
    if (dealName === "viewport" || dealName === "description" || dealName.length < 3) continue;

    // Grab a chunk from this deal start to extract its fields
    // Each deal object ends before the next \"id\": or is about 1500 chars
    const chunkStart = match.index;
    const chunkEnd = Math.min(chunkStart + 2000, html.length);
    const chunk = html.slice(chunkStart, chunkEnd);

    // Extract link
    const linkMatch = chunk.match(/\\"link\\":\\"((?:[^\\]|\\[^"])*)\\"/);
    if (!linkMatch) continue;
    let link = linkMatch[1]
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&");

    // Only Amazon deals
    if (!link.includes("amazon.com") && !link.includes("amzn.to")) continue;

    // Extract price (comes as "price":"12.99" or "price":null)
    const priceMatch = chunk.match(/\\"price\\":\\"(\d+\.?\d*)\\"/);
    const origPriceMatch = chunk.match(/\\"originalPrice\\":\\"(\d+\.?\d*)\\"/);

    const dealPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
    const origPrice = origPriceMatch ? parseFloat(origPriceMatch[1]) : 0;

    // Extract first marketplace image
    const picMatch = chunk.match(/\\"marketplacePictures\\":\[\\"(https:[^\\]+)\\"/);
    const image = picMatch
      ? picMatch[1].replace(/\\u002[fF]/g, "/")
      : null;

    // Extract expiry
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

    // Extract flags (hot, lowest price ever, prime deal)
    const flagsMatch = chunk.match(/\\"flags\\":\[(.*?)\]/);
    const isHot = flagsMatch
      ? flagsMatch[1].toLowerCase().includes("lowest") || flagsMatch[1].toLowerCase().includes("prime")
      : false;

    // Build affiliate URL
    const affiliateUrl = replaceAffiliateTag(link);

    // Calculate discount
    const discount = origPrice > 0 && dealPrice > 0 && origPrice > dealPrice
      ? Math.round((1 - dealPrice / origPrice) * 100)
      : 0;

    seen.add(dealId);

    deals.push({
      id: `sd_${dealId}`,
      title: dealName.slice(0, 120),
      category: guessCategory(dealName),
      originalPrice: origPrice,
      dealPrice: dealPrice,
      discount: discount,
      image: image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
      affiliate_url: affiliateUrl,
      store: "Amazon",
      expires: expires,
      hot: isHot || discount >= 30,
      posted_at: new Date().toISOString(),
    });

    console.log(`Deal: ${dealName.slice(0, 50)} | $${dealPrice} | was $${origPrice} | ${discount}% off | img: ${image ? "yes" : "no"}`);
  }

  return deals;
}

async function scrapeStundeals() {
  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);

    const allDeals = parseDealObjects(html);

    // Filter: only keep deals that have a price
    const validDeals = allDeals.filter(d => d.dealPrice > 0);
    console.log(`Found ${allDeals.length} total Amazon deals, ${validDeals.length} with valid prices`);

    return validDeals.slice(0, parseInt(process.env.MAX_DEALS_PER_RUN || "5"));
  } catch (e) {
    console.error(`Scrape failed: ${e.message}`);
    return [];
  }
}

function saveDeals(deals) {
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(DEALS_JSON_PATH, "utf8"));
  } catch (e) {}

  const existingIds = new Set(existing.map(d => d.id));
  const newDeals = deals.filter(d => !existingIds.has(d.id));

  if (!newDeals.length) {
    console.log("No new deals to save.");
    return 0;
  }

  const allDeals = [...newDeals, ...existing]
    .sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
    .slice(0, MAX_STORED);

  fs.mkdirSync(path.dirname(DEALS_JSON_PATH), { recursive: true });
  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(allDeals, null, 2));
  console.log(`Saved ${newDeals.length} new deals. Total: ${allDeals.length}`);
  return newDeals.length;
}

(async () => {
  console.log("=".repeat(55));
  console.log(`DealsPulse Bot — ${new Date().toUTCString()}`);
  const deals = await scrapeStundeals();
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`Done: ${saved} new deals saved.`);
  } else {
    console.log("No deals found this run.");
  }
})();
