/**
 * DealsPulse Bot — stundeals.com scraper
 * - Fetches real product images from Amazon
 * - Keeps only 50 most recent deals
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_DEALS       = parseInt(process.env.MAX_DEALS_PER_RUN || "20");
const MAX_STORED      = 50; // max deals to keep
const STUNDEALS_TAG   = "stundeals0d-20";

function fetchPage(url, asText = true) {
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
        return fetchPage(next, asText).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => {
        data += chunk;
        if (data.length > 200000) req.destroy(); // cap at 200kb
      });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Extract Open Graph or product image from Amazon page
async function fetchProductImage(amazonUrl) {
  try {
    const html = await fetchPage(amazonUrl);
    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
                 || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    if (ogMatch) return ogMatch[1];

    // Try main product image
    const imgMatch = html.match(/id="landingImage"[^>]+src="([^"]+)"/i)
                  || html.match(/id="imgBlkFront"[^>]+src="([^"]+)"/i)
                  || html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/);
    if (imgMatch) return imgMatch[1];

    return null;
  } catch (e) {
    return null;
  }
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

function extractPrices(text) {
  const prices = [];
  const matches = text.match(/\$[\d,]+\.?\d*/g) || [];
  for (const m of matches) {
    const n = parseFloat(m.replace(/[$,]/g, ""));
    if (n > 0 && n < 10000) prices.push(n);
  }
  return prices;
}

function guessCategory(title) {
  const t = title.toLowerCase();
  if (t.match(/laptop|phone|tv|headphone|speaker|camera|tablet|xbox|playstation|nintendo|ipad|macbook|airpod|monitor|router|ssd|gpu/)) return "Electronics";
  if (t.match(/shirt|shoe|pants|dress|jacket|sneaker|clothing|fashion|jeans|hoodie|boots|socks/)) return "Fashion";
  if (t.match(/kitchen|cookware|instant pot|air fryer|blender|coffee|vacuum|dyson|bedding|towel/)) return "Home & Kitchen";
  if (t.match(/book|kindle|audible/)) return "Books";
  if (t.match(/toy|lego|game|gaming|puzzle/)) return "Toys & Games";
  if (t.match(/beauty|skincare|makeup|shampoo|perfume|cologne/)) return "Beauty";
  if (t.match(/sport|fitness|gym|bike|yoga|running|golf/)) return "Sports";
  return "General";
}

function hashId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
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

    const amazonLinkRegex = /https?:\/\/(?:www\.)?amazon\.com\/[^\s"'<>]*tag=stundeals[^\s"'<>]*/g;
    const allLinks = [...new Set(html.match(amazonLinkRegex) || [])];
    console.log(`Found ${allLinks.length} Amazon affiliate links`);

    // Try structured deal blocks first
    const dealBlockRegex = /<(?:div|article|li|section)[^>]*class="[^"]*(?:deal|product|item|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi;
    const blocks = [];
    let blockMatch;
    while ((blockMatch = dealBlockRegex.exec(html)) !== null) {
      blocks.push(blockMatch[1]);
    }
    console.log(`Found ${blocks.length} deal blocks`);

    const linksToProcess = [];

    if (blocks.length > 0) {
      for (const block of blocks.slice(0, MAX_DEALS * 2)) {
        if (linksToProcess.length >= MAX_DEALS) break;
        const amazonMatch = block.match(/https?:\/\/(?:www\.)?amazon\.com\/[^\s"'<>]*tag=stundeals[^\s"'<>]*/);
        if (!amazonMatch) continue;

        const affiliateUrl = replaceAffiliateTag(amazonMatch[0].split('"')[0]);
        const titleMatch = block.match(/<(?:h[1-6]|a)[^>]*>(.*?)<\/(?:h[1-6]|a)>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : "";
        const prices = extractPrices(block);

        linksToProcess.push({ affiliateUrl, title, prices, image: null });
      }
    } else {
      // Fallback to raw links
      for (const link of allLinks.slice(0, MAX_DEALS)) {
        const affiliateUrl = replaceAffiliateTag(link);
        linksToProcess.push({ affiliateUrl, title: "", prices: [], image: null });
      }
    }

    // Fetch real product images from Amazon
    for (const item of linksToProcess) {
      console.log(`Fetching image for: ${item.affiliateUrl.slice(0, 60)}...`);
      const image = await fetchProductImage(item.affiliateUrl);
      item.image = image;
      await sleep(1000); // be polite, avoid rate limiting

      const dealPrice = item.prices.length > 0 ? Math.min(...item.prices) : 0;
      const origPrice = item.prices.length > 1 ? Math.max(...item.prices) : dealPrice * 1.35;
      const discount = dealPrice && origPrice ? Math.round((1 - dealPrice / origPrice) * 100) : 15;
      const id = hashId(item.affiliateUrl);

      // Get title from Amazon page if not found in block
      let title = item.title;
      if (!title) {
        const asinMatch = item.affiliateUrl.match(/\/dp\/([A-Z0-9]{10})/);
        title = asinMatch ? `Amazon Deal (${asinMatch[1]})` : "Amazon Deal";
      }

      const category = guessCategory(title);

      deals.push({
        id,
        title: title.slice(0, 120),
        category,
        originalPrice: parseFloat((origPrice || 0).toFixed(2)),
        dealPrice: parseFloat((dealPrice || 0).toFixed(2)),
        discount: Math.max(discount, 5),
        image: image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
        affiliate_url: item.affiliateUrl,
        store: "Amazon",
        expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
        hot: discount >= 30,
        posted_at: new Date().toISOString(),
      });
    }

  } catch (e) {
    console.error(`Scrape failed: ${e.message}`);
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

  // Combine new + existing, keep only most recent MAX_STORED
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
  console.log(`Found ${deals.length} deals`);
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`Done: ${saved} new deals saved.`);
  } else {
    console.log("No deals found this run.");
  }
})();
