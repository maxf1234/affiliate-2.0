/**
 * DealsPulse Bot — stundeals.com scraper
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

// Follow amzn.to short links to get the real Amazon URL with ASIN
function resolveShortLink(url) {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          resolve(res.headers.location);
        } else {
          resolve(url);
        }
      });
      req.on("error", () => resolve(url));
      req.setTimeout(5000, () => { req.destroy(); resolve(url); });
      req.end();
    } catch (e) {
      resolve(url);
    }
  });
}

function addAffiliateTag(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("tag", AFFILIATE_TAG);
    // Clean up to just dp/ASIN with tag
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
    if (asinMatch) {
      return `https://www.amazon.com/dp/${asinMatch[1]}?tag=${AFFILIATE_TAG}`;
    }
    return u.toString();
  } catch (e) {
    return url;
  }
}

function replaceTag(url) {
  return url.replace(STUNDEALS_TAG, AFFILIATE_TAG);
}

function guessCategory(name) {
  const t = (name || "").toLowerCase();
  if (t.match(/laptop|phone|tv|headphone|speaker|camera|tablet|xbox|playstation|nintendo|ipad|macbook|airpod|monitor|router|ssd|gpu|battery|charger|cable/)) return "Electronics";
  if (t.match(/shirt|shoe|pants|dress|jacket|sneaker|clothing|fashion|jeans|hoodie|boots|socks|sunglasses/)) return "Fashion";
  if (t.match(/kitchen|cookware|instant pot|air fryer|blender|coffee|vacuum|dyson|bedding|towel|pot|pan|grill|cooker|oven|juicer|toaster/)) return "Home & Kitchen";
  if (t.match(/book|kindle|audible/)) return "Books";
  if (t.match(/toy|lego|game|gaming|puzzle|playmobil|kinetic|rocking|walker/)) return "Toys & Games";
  if (t.match(/beauty|skincare|makeup|shampoo|perfume|cologne|toothpaste|deodorant/)) return "Beauty";
  if (t.match(/sport|fitness|gym|bike|yoga|running|golf|pool|fan/)) return "Sports";
  if (t.match(/chair|desk|furniture|whiteboard|sofa|table/)) return "Furniture";
  return "General";
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeStundeals() {
  const deals = [];

  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);

    // Parse deals using escaped quote pattern
    const escapedIdRegex = /\\"id\\":(\d+),\\"name\\":\\"([^\\]+)\\",\\"link\\":\\"([^\\]+)\\"/g;
    const rawDeals = [];
    let m;
    while ((m = escapedIdRegex.exec(html)) !== null) {
      const id = m[1];
      const name = m[2];
      const rawLink = m[3]
        .replace(/\\u002[fF]/g, "/")
        .replace(/\\u0026/g, "&")
        .replace(/\\/g, "");

      const pos = m.index;
      const chunk = html.slice(pos, pos + 1000);

      const priceMatch = chunk.match(/\\"price\\":\\"(\d+\.?\d*)\\"/);
      const origMatch = chunk.match(/\\"originalPrice\\":\\"(\d+\.?\d*)\\"/);
      const picMatch = chunk.match(/\\"marketplacePictures\\":\[\\"([^\\]+)\\"/);

      const dealPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
      const origPrice = origMatch ? parseFloat(origMatch[1]) : 0;

      if (!dealPrice) continue;

      const image = picMatch
        ? picMatch[1].replace(/\\u002[fF]/g, "/")
        : null;

      rawDeals.push({ id, name, rawLink, dealPrice, origPrice, image });
    }

    console.log(`Found ${rawDeals.length} raw deals`);

    // Process each deal
    for (const item of rawDeals) {
      let affiliateUrl = null;

      if (item.rawLink.includes("amazon.com") && item.rawLink.includes("tag=")) {
        // Direct Amazon link with tag — just replace the tag
        affiliateUrl = replaceTag(item.rawLink);
      } else if (item.rawLink.includes("amazon.com")) {
        // Direct Amazon link without tag — add tag
        affiliateUrl = addAffiliateTag(item.rawLink);
      } else if (item.rawLink.includes("amzn.to")) {
        // Short link — resolve to get ASIN then add tag
        console.log(`Resolving short link for: ${item.name}`);
        const resolved = await resolveShortLink(item.rawLink);
        console.log(`Resolved: ${resolved.slice(0, 80)}`);
        if (resolved.includes("amazon.com")) {
          affiliateUrl = addAffiliateTag(resolved);
        }
        await sleep(500);
      } else {
        // Not Amazon — skip
        continue;
      }

      if (!affiliateUrl) continue;

      const discount = item.origPrice > item.dealPrice
        ? Math.round((1 - item.dealPrice / item.origPrice) * 100)
        : 10;

      deals.push({
        id: `sd_${item.id}`,
        title: item.name.slice(0, 120),
        category: guessCategory(item.name),
        originalPrice: item.origPrice || parseFloat((item.dealPrice * 1.3).toFixed(2)),
        dealPrice: parseFloat(item.dealPrice.toFixed(2)),
        discount: Math.max(discount, 5),
        image: item.image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
        affiliate_url: affiliateUrl,
        store: "Amazon",
        expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
        hot: discount >= 30,
        posted_at: new Date().toISOString(),
      });
    }

    console.log(`Found ${deals.length} valid Amazon deals`);

  } catch (e) {
    console.error(`Scrape failed: ${e.message}`);
    console.error(e.stack);
  }

  return deals;
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
