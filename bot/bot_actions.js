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
 
function extractDealsWithRegex(html) {
  const deals = [];
  
  // Extract each deal object individually using regex
  // Match pattern: {"id":NUMBER,"name":"...","link":"...","price":"...","originalPrice":"...","marketplacePictures":[...]}
  const idRegex = /"id":(\d+),"name":"([^"]+)","link":"([^"]+)"/g;
  let m;
  
  while ((m = idRegex.exec(html)) !== null) {
    const [, id, name, rawLink] = m;
    const pos = m.index;
    
    // Extract a chunk around this deal to find price and images
    const chunk = html.slice(pos, pos + 2000);
    
    // Extract price
    const priceMatch = chunk.match(/"price":"?(\d+\.?\d*)"?/);
    const origPriceMatch = chunk.match(/"originalPrice":"?(\d+\.?\d*)"?/);
    
    const dealPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
    const origPrice = origPriceMatch ? parseFloat(origPriceMatch[1]) : 0;
    
    if (!dealPrice) continue;
    
    // Fix link - unescape unicode
    const link = rawLink
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\/g, "");
    
    if (!link.includes("amazon.com") && !link.includes("amzn.to")) continue;
    
    // Extract marketplace pictures
    const picMatch = chunk.match(/"marketplacePictures":\["([^"]+)"/);
    const image = picMatch 
      ? picMatch[1].replace(/\\u002[fF]/g, "/")
      : "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";
    
    // Extract expiry
    const expiredMatch = chunk.match(/"expired":"([^"]+)"/);
    let expires = expiredMatch ? expiredMatch[1] : null;
    // Convert MM/DD/YYYY to YYYY-MM-DD
    if (expires && expires.includes("/")) {
      const parts = expires.split("/");
      expires = `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}`;
    }
    if (!expires) {
      expires = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    }
 
    // Check for hot flags
    const hotMatch = chunk.match(/"flags":\[([^\]]*)\]/);
    const isHot = hotMatch ? hotMatch[1].includes("lowest") || hotMatch[1].includes("prime") : false;
 
    const discount = origPrice > dealPrice
      ? Math.round((1 - dealPrice / origPrice) * 100)
      : 10;
 
    const affiliateUrl = replaceAffiliateTag(link);
 
    deals.push({
      id: `sd_${id}`,
      title: name.slice(0, 120),
      category: guessCategory(name),
      originalPrice: origPrice || parseFloat((dealPrice * 1.3).toFixed(2)),
      dealPrice: parseFloat(dealPrice.toFixed(2)),
      discount: Math.max(discount, 5),
      image,
      affiliate_url: affiliateUrl,
      store: "Amazon",
      expires,
      hot: isHot || discount >= 30,
      posted_at: new Date().toISOString(),
    });
  }
 
  return deals;
}
 
async function scrapeStundeals() {
  try {
    console.log("Fetching stundeals.com...");
    const html = await fetchPage("https://www.stundeals.com");
    console.log(`Got ${html.length} bytes`);
 
    // Extract all Next.js push data
    let fullData = "";
    const pushRegex = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
    let m;
    while ((m = pushRegex.exec(html)) !== null) {
      fullData += m[1];
    }
 
    // Partial unescape - just enough to read the fields we need
    fullData = fullData
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003[cC]/g, "<")
      .replace(/\\u003[eE]/g, ">");
 
    console.log(`Extracted ${fullData.length} chars`);
 
    const deals = extractDealsWithRegex(fullData);
    console.log(`Found ${deals.length} Amazon deals`);
    return deals;
 
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
 
