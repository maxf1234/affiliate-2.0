/**
 * DealsPulse Bot — uses Slickdeals RSS feed (no auth, no blocking)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const AFFILIATE_TAG   = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");
const MAX_DEALS       = parseInt(process.env.MAX_DEALS_PER_RUN || "20");

function get(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DealsPulseBot/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      }
    };
    https.get(url, options, res => {
      // follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseXML(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || "";
    const link  = (item.match(/<link>(.*?)<\/link>/) || item.match(/<guid>(.*?)<\/guid>/) || [])[1] || "";
    const desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || "";
    const thumb = (item.match(/<media:thumbnail[^>]+url="([^"]+)"/) || item.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || "";
    if (title && link) items.push({ title, link, desc, thumb });
  }
  return items;
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

function addAffiliateTag(url) {
  try {
    if (url.includes("amazon.com")) {
      const u = new URL(url);
      u.searchParams.set("tag", AFFILIATE_TAG);
      return u.toString();
    }
  } catch (e) {}
  return url;
}

function guessCategory(title) {
  const t = title.toLowerCase();
  if (t.match(/laptop|phone|tv|headphone|speaker|camera|tablet|xbox|playstation|nintendo|ipad|macbook|airpod/)) return "Electronics";
  if (t.match(/shirt|shoe|pants|dress|jacket|sneaker|clothing|fashion|jeans|hoodie/)) return "Fashion";
  if (t.match(/kitchen|cookware|instant pot|air fryer|blender|coffee|vacuum|dyson/)) return "Home & Kitchen";
  if (t.match(/book|kindle|audible/)) return "Books";
  if (t.match(/toy|lego|game|gaming/)) return "Toys & Games";
  if (t.match(/beauty|skincare|makeup|shampoo/)) return "Beauty";
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

async function fetchSlickdeals() {
  const deals = [];
  const feeds = [
    "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1",
    "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1&forumid[]=9",
  ];

  for (const feedUrl of feeds) {
    try {
      console.log(`Fetching ${feedUrl}...`);
      const xml = await get(feedUrl);
      const items = parseXML(xml);
      console.log(`Got ${items.length} items`);

      for (const item of items) {
        if (deals.length >= MAX_DEALS) break;

        const prices = extractPrices(item.title + " " + item.desc);
        const dealPrice = prices.length > 0 ? Math.min(...prices) : null;
        const origPrice = prices.length > 1 ? Math.max(...prices) : dealPrice ? dealPrice * 1.4 : null;

        if (!dealPrice) continue;

        const discount = origPrice ? Math.round((1 - dealPrice / origPrice) * 100) : 20;

        deals.push({
          id: hashId(item.link),
          title: item.title.replace(/<[^>]+>/g, "").trim().slice(0, 120),
          category: guessCategory(item.title),
          originalPrice: parseFloat((origPrice || dealPrice * 1.4).toFixed(2)),
          dealPrice: parseFloat(dealPrice.toFixed(2)),
          discount: Math.max(discount, 5),
          image: item.thumb || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80",
          affiliate_url: addAffiliateTag(item.link),
          store: item.link.includes("amazon.com") ? "Amazon" : "Various",
          expires: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          hot: discount >= 30,
          posted_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`Feed failed: ${e.message}`);
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
  const deals = await fetchSlickdeals();
  console.log(`Found ${deals.length} deals`);
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`Done: ${saved} new deals saved.`);
  } else {
    console.log("No deals found.");
  }
})();
