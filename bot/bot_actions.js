/**
 * DealsPulse Bot — scrapes stundeals.com
 * Replaces their affiliate tag with yours
 */
 
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
 
const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_DEALS       = parseInt(process.env.MAX_DEALS_PER_RUN || "20");
const STUNDEALS_TAG   = "stundeals0d-20"; // their tag to replace
 
const CATEGORY_IMAGE_POOLS = {
  "Electronics": [
    "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
    "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=400&q=80",
    "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=400&q=80",
  ],
  "Fashion": [
    "https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&q=80",
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80",
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&q=80",
  ],
  "Home & Kitchen": [
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
    "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
  ],
  "Books": [
    "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80",
    "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&q=80",
  ],
  "Toys & Games": [
    "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&q=80",
    "https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=400&q=80",
  ],
  "Beauty": [
    "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&q=80",
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80",
  ],
  "Sports": [
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=80",
    "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400&q=80",
  ],
  "General": [
    "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&q=80",
    "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=400&q=80",
  ],
};
 
function getImageForDeal(category, id) {
  const pool = CATEGORY_IMAGE_POOLS[category] || CATEGORY_IMAGE_POOLS["General"];
  const index = Math.abs(parseInt(id, 36) || id.charCodeAt(0)) % pool.length;
  return pool[index];
}
 
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
      // follow redirects
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
  return url.replace(STUNDEALS_TAG, AFFILIATE_TAG);
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
 
async function scrapeStundeals() {
  const deals = [];
 
  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);
 
    // Find all Amazon affiliate links with stundeals tag
    const amazonLinkRegex = /https?:\/\/(?:www\.)?amazon\.com\/[^\s"'<>]*tag=stundeals[^\s"'<>]*/g;
    const allLinks = [...new Set(html.match(amazonLinkRegex) || [])];
    console.log(`Found ${allLinks.length} Amazon affiliate links`);
 
    // Find deal blocks — try common patterns
    // Pattern: look for title + price near each Amazon link
    const dealBlockRegex = /<(?:div|article|li|section)[^>]*class="[^"]*(?:deal|product|item|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li|section)>/gi;
    const blocks = [];
    let blockMatch;
    while ((blockMatch = dealBlockRegex.exec(html)) !== null) {
      blocks.push(blockMatch[1]);
    }
    console.log(`Found ${blocks.length} deal blocks`);
 
    if (blocks.length > 0) {
      // Parse structured deal blocks
      for (const block of blocks.slice(0, MAX_DEALS * 2)) {
        if (deals.length >= MAX_DEALS) break;
 
        const amazonMatch = block.match(/https?:\/\/(?:www\.)?amazon\.com\/[^\s"'<>]*tag=stundeals[^\s"'<>]*/);
        if (!amazonMatch) continue;
 
        const affiliateUrl = replaceAffiliateTag(amazonMatch[0].split('"')[0]);
 
        // Extract title
        const titleMatch = block.match(/<(?:h[1-6]|a)[^>]*>(.*?)<\/(?:h[1-6]|a)>/i);
        const title = titleMatch ? stripHtml(titleMatch[1]) : "";
        if (!title || title.length < 5) continue;
 
        // Extract image
        const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
        const image = imgMatch ? imgMatch[1] : null;
 
        // Extract prices
        const prices = extractPrices(block);
        const dealPrice = prices.length > 0 ? Math.min(...prices) : null;
        const origPrice = prices.length > 1 ? Math.max(...prices) : dealPrice ? dealPrice * 1.35 : null;
 
        if (!dealPrice) continue;
 
        const discount = origPrice ? Math.round((1 - dealPrice / origPrice) * 100) : 15;
        const id = hashId(affiliateUrl);
        const category = guessCategory(title);
 
        deals.push({
          id,
          title: title.slice(0, 120),
          category,
          originalPrice: parseFloat((origPrice || dealPrice * 1.35).toFixed(2)),
          dealPrice: parseFloat(dealPrice.toFixed(2)),
          discount: Math.max(discount, 5),
          image: (image && image.startsWith("http")) ? image : getImageForDeal(category, id),
          affiliate_url: affiliateUrl,
          store: "Amazon",
          expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          hot: discount >= 30,
          posted_at: new Date().toISOString(),
        });
      }
    }
 
    // Fallback: if no structured blocks found, use raw Amazon links
    if (deals.length === 0 && allLinks.length > 0) {
      console.log("Using fallback: raw Amazon links");
      for (const link of allLinks.slice(0, MAX_DEALS)) {
        const affiliateUrl = replaceAffiliateTag(link);
        const id = hashId(affiliateUrl);
 
        // Try to extract ASIN for title
        const asinMatch = affiliateUrl.match(/\/dp\/([A-Z0-9]{10})/);
        const title = asinMatch ? `Amazon Deal (${asinMatch[1]})` : "Amazon Deal";
 
        deals.push({
          id,
          title,
          category: "General",
          originalPrice: 0,
          dealPrice: 0,
          discount: 0,
          image: getImageForDeal("General", id),
          affiliate_url: affiliateUrl,
          store: "Amazon",
          expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          hot: false,
          posted_at: new Date().toISOString(),
        });
      }
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
 
  const allDeals = [...newDeals, ...existing].slice(0, 100);
  fs.mkdirSync(path.dirname(DEALS_JSON_PATH), { recursive: true });
  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(allDeals, null, 2));
  console.log(`Saved ${newDeals.length} new deals`);
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
 
