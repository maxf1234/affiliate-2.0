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
 
function replaceAffiliateTag(url) {
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
 
function hashId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
 
async function scrapeStundeals() {
  const deals = [];
 
  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);
 
    // Find all Amazon affiliate links
    const amazonLinkRegex = /https?:\/\/(?:www\.)?amazon\.com\/[^\s"'\\]*tag=stundeals[^\s"'\\]*/g;
    const allAmazonLinks = [...new Set(html.match(amazonLinkRegex) || [])];
    console.log(`Found ${allAmazonLinks.length} Amazon affiliate links`);
 
    for (const link of allAmazonLinks) {
      const affiliateUrl = replaceAffiliateTag(link);
      const asinMatch = link.match(/\/dp\/([A-Z0-9]{10})/);
      const linkPos = html.indexOf(link);
 
      // Look in a wide window around this link for metadata
      const before = html.slice(Math.max(0, linkPos - 3000), linkPos);
      const after = html.slice(linkPos, linkPos + 1000);
      const context = before + after;
 
      // Find name - look for escaped name field nearby
      const nameMatch = before.match(/\\"name\\":\\"([^\\]+)\\"/g);
      // Get last name match before this link (most likely to be this deal)
      let name = null;
      if (nameMatch) {
        const lastMatch = nameMatch[nameMatch.length - 1];
        name = lastMatch.replace(/\\"name\\":\\"/, "").replace(/\\"$/, "");
      }
      if (!name && asinMatch) name = `Amazon Deal (${asinMatch[1]})`;
      if (!name) name = "Amazon Deal";
 
      // Find prices - look for price patterns in context
      const priceMatches = context.match(/\\"price\\":\\"(\d+\.?\d*)\\"/g) || [];
      const origPriceMatches = context.match(/\\"originalPrice\\":\\"(\d+\.?\d*)\\"/g) || [];
      
      // Also try unescaped price patterns
      const priceMatches2 = context.match(/"price":"(\d+\.?\d*)"/g) || [];
      const origPriceMatches2 = context.match(/"originalPrice":"(\d+\.?\d*)"/g) || [];
 
      let dealPrice = 0;
      let origPrice = 0;
 
      if (priceMatches.length > 0) {
        dealPrice = parseFloat(priceMatches[priceMatches.length - 1].match(/(\d+\.?\d*)/)[0]);
      } else if (priceMatches2.length > 0) {
        dealPrice = parseFloat(priceMatches2[priceMatches2.length - 1].match(/(\d+\.?\d*)/)[0]);
      }
 
      if (origPriceMatches.length > 0) {
        origPrice = parseFloat(origPriceMatches[origPriceMatches.length - 1].match(/(\d+\.?\d*)/)[0]);
      } else if (origPriceMatches2.length > 0) {
        origPrice = parseFloat(origPriceMatches2[origPriceMatches2.length - 1].match(/(\d+\.?\d*)/)[0]);
      }
 
      console.log(`Deal: ${name.slice(0,40)} | price: $${dealPrice} | orig: $${origPrice}`);
 
      // Find image - look for marketplace pictures
      const picMatch = before.match(/\\"marketplacePictures\\":\[\\"([^"\\][^\\]*)\\"/g);
      let image = null;
      if (picMatch) {
        const lastPic = picMatch[picMatch.length - 1];
        image = lastPic.match(/\[\\"([^"\\][^\\]*)\\"/)
          ? lastPic.match(/\[\\"([^"\\][^\\]*)\\"/) [1].replace(/\\/g, "")
          : null;
      }
      if (!image) {
        // Try unescaped
        const picMatch2 = before.match(/"marketplacePictures":\["([^"]+)"/);
        if (picMatch2) image = picMatch2[1];
      }
 
      const discount = origPrice > dealPrice && dealPrice > 0
        ? Math.round((1 - dealPrice / origPrice) * 100)
        : 15;
 
      deals.push({
        id: hashId(link),
        title: name.slice(0, 120),
        category: guessCategory(name),
        originalPrice: origPrice || (dealPrice ? parseFloat((dealPrice * 1.3).toFixed(2)) : 0),
        dealPrice: dealPrice || 0,
        discount: Math.max(discount, 5),
        image: image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
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
