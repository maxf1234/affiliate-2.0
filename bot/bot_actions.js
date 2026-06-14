/**
 * DealsPulse Bot — parses stundeals.com embedded JSON data
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
 
async function scrapeStundeals() {
  const deals = [];
 
  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);
 
    // The data is in self.__next_f.push calls as escaped JSON strings
    // Extract all push content and combine
    let fullData = "";
    const pushRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
    let m;
    while ((m = pushRegex.exec(html)) !== null) {
      fullData += m[1];
    }
 
    // Unescape the string
    fullData = fullData
      .replace(/\\"/g, '"')
      .replace(/\\n/g, " ")
      .replace(/\\r/g, " ")
      .replace(/\\\\/g, "\\")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u002[fF]/g, "/");
 
    console.log(`Extracted ${fullData.length} chars of data`);
 
    // Find the deals array - it starts with {"id": and has "name", "link"
    // Try to find a JSON array of deals
    const startIdx = fullData.indexOf('"data":[{"id"');
    if (startIdx === -1) {
      console.log("Could not find data array — trying alternative parse");
      // Try finding individual deal objects
      const altStart = fullData.indexOf('{"id":');
      console.log(`Alternative start at index: ${altStart}`);
      console.log(`Sample data: ${fullData.slice(Math.max(0, altStart), altStart + 500)}`);
      return deals;
    }
 
    // Extract from "data":[ to the end of the array
    const dataStr = fullData.slice(startIdx + 8); // skip "data":
    
    // Find matching bracket
    let depth = 0;
    let endIdx = 0;
    for (let i = 0; i < dataStr.length; i++) {
      if (dataStr[i] === "[") depth++;
      if (dataStr[i] === "]") {
        depth--;
        if (depth === 0) { endIdx = i + 1; break; }
      }
    }
 
    const arrStr = dataStr.slice(0, endIdx);
    console.log(`Found data array of length ${arrStr.length}`);
 
    let dealsArray;
    try {
      dealsArray = JSON.parse(arrStr);
    } catch (e) {
      console.error(`JSON parse failed: ${e.message}`);
      console.log(`First 500 chars: ${arrStr.slice(0, 500)}`);
      return deals;
    }
 
    console.log(`Parsed ${dealsArray.length} items from data array`);
 
    for (const item of dealsArray) {
      if (!item.name || !item.link) continue;
      if (!item.link.includes("amazon.com") && !item.link.includes("amzn.to")) continue;
 
      const dealPrice = parseFloat(item.price) || 0;
      const origPrice = parseFloat(item.originalPrice) || 0;
 
      if (!dealPrice) continue;
 
      const discount = origPrice > dealPrice
        ? Math.round((1 - dealPrice / origPrice) * 100)
        : 10;
 
      // Get first marketplace picture
      const image = (item.marketplacePictures && item.marketplacePictures.length > 0)
        ? item.marketplacePictures[0]
        : "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";
 
      const affiliateUrl = replaceAffiliateTag(item.link);
 
      deals.push({
        id: `sd_${item.id}`,
        title: item.name.slice(0, 120),
        category: guessCategory(item.name),
        originalPrice: origPrice || parseFloat((dealPrice * 1.3).toFixed(2)),
        dealPrice: parseFloat(dealPrice.toFixed(2)),
        discount: Math.max(discount, 5),
        image,
        affiliate_url: affiliateUrl,
        store: "Amazon",
        expires: item.expired || new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
        hot: discount >= 30 || (item.flags && item.flags.some(f => f.name && f.name.toLowerCase().includes("lowest"))),
        posted_at: new Date().toISOString(),
      });
    }
 
    console.log(`Parsed ${deals.length} valid Amazon deals`);
 
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
  console.log(`Found ${deals.length} deals`);
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`Done: ${saved} new deals saved.`);
  } else {
    console.log("No deals found this run.");
  }
})();
 
