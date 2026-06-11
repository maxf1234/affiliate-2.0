/**
 * DealsPulse Bot — GitHub Actions version
 * Uses Reddit r/deals and r/frugal via public JSON API (no auth needed)
 * and converts links to Amazon affiliate links where possible.
 */
 
const fs = require("fs");
const path = require("path");
const https = require("https");
 
const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_DEALS       = parseInt(process.env.MAX_DEALS_PER_RUN || "10");
 
function get(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "DealsPulseBot/1.0 (deals aggregator)",
        "Accept": "application/json",
      }
    };
    https.get(url, options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}
 
function addAffiliateTag(url) {
  if (!url) return url;
  if (url.includes("amazon.com")) {
    const u = new URL(url);
    u.searchParams.set("tag", AFFILIATE_TAG);
    return u.toString();
  }
  return url;
}
 
function extractImage(post) {
  if (post.thumbnail && post.thumbnail.startsWith("http")) return post.thumbnail;
  if (post.preview && post.preview.images && post.preview.images[0]) {
    return post.preview.images[0].source.url.replace(/&amp;/g, "&");
  }
  return "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";
}
 
function guessCategory(title) {
  const t = title.toLowerCase();
  if (t.match(/laptop|phone|tv|headphone|speaker|camera|tablet|xbox|playstation|nintendo/)) return "Electronics";
  if (t.match(/shirt|shoe|pants|dress|jacket|sneaker|clothing|fashion/)) return "Fashion";
  if (t.match(/kitchen|cookware|instant pot|air fryer|blender|coffee/)) return "Home & Kitchen";
  if (t.match(/book|kindle|audible/)) return "Books";
  if (t.match(/toy|game|lego/)) return "Toys";
  return "General";
}
 
async function fetchRedditDeals() {
  const deals = [];
  const subreddits = ["deals", "frugalmalefashion", "buildapcsales", "gamedeals"];
 
  for (const sub of subreddits) {
    try {
      console.log(`Fetching r/${sub}...`);
      const data = await get(`https://www.reddit.com/r/${sub}/hot.json?limit=25`);
      const posts = data.data.children;
 
      for (const { data: post } of posts) {
        if (deals.length >= MAX_DEALS) break;
        if (post.stickied || post.score < 50) continue;
 
        const title = post.title;
        const url = post.url;
 
        // Try to extract price info from title
        const priceMatch = title.match(/\$[\d,]+\.?\d*/g);
        if (!priceMatch) continue;
 
        const prices = priceMatch.map(p => parseFloat(p.replace(/[$,]/g, "")));
        if (prices.length < 1) continue;
 
        const dealPrice = Math.min(...prices);
        const origPrice = prices.length > 1 ? Math.max(...prices) : dealPrice * 1.3;
        const discount = Math.round((1 - dealPrice / origPrice) * 100);
 
        deals.push({
          id: post.id,
          title: title.slice(0, 120),
          category: guessCategory(title),
          originalPrice: parseFloat(origPrice.toFixed(2)),
          dealPrice: parseFloat(dealPrice.toFixed(2)),
          discount: discount > 0 ? discount : 10,
          image: extractImage(post),
          affiliate_url: addAffiliateTag(url),
          store: url.includes("amazon.com") ? "Amazon" : "Various",
          expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          hot: post.score > 500 || discount >= 40,
          posted_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`Failed to fetch r/${sub}: ${e.message}`);
    }
 
    if (deals.length >= MAX_DEALS) break;
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
  const deals = await fetchRedditDeals();
  console.log(`Found ${deals.length} deals`);
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`Done: ${saved} new deals saved.`);
  } else {
    console.log("No deals found.");
  }
})();
