/**
 * DealsPulse Bot — GitHub Actions version
 * =========================================
 * Scrapes Amazon deals and saves to public/deals.json.
 * GitHub Actions handles the git commit and push.
 * WhatsApp NOT included here — use bot.js on your local machine for that.
 */
 
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
 
const AFFILIATE_TAG     = process.env.AMAZON_AFFILIATE_TAG || "youraffid-20";
const DEALS_JSON_PATH   = path.join(__dirname, "..", "public", "deals.json");
const MIN_DISCOUNT_PCT  = parseInt(process.env.MIN_DISCOUNT_PCT || "20");
const MAX_DEALS_PER_RUN = parseInt(process.env.MAX_DEALS_PER_RUN || "10");
 
const HEADERS_POOL = [
  { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
  { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", "Accept-Language": "en-GB,en;q=0.9" },
];
 
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
 
function parsePrice(text) {
  if (!text) return null;
  const num = parseFloat(text.replace(/[$,]/g, "").trim());
  return isNaN(num) ? null : num;
}
 
async function scrapeDeals() {
  const deals = [];
  const seen = new Set();
 
  try {
    await sleep(2000 + Math.random() * 3000);
    const headers = HEADERS_POOL[Math.floor(Math.random() * HEADERS_POOL.length)];
    const { data: html } = await axios.get("https://www.amazon.com/gp/goldbox", {
      headers,
      timeout: 15000,
    });
 
    const $ = cheerio.load(html);
    const cards = $("div[data-asin]").toArray();
    console.log(`Found ${cards.length} candidate cards`);
 
    for (const card of cards.slice(0, MAX_DEALS_PER_RUN * 3)) {
      try {
        const asin = $(card).attr("data-asin");
        if (!asin || seen.has(asin)) continue;
 
        const titleEl = $(card).find("a[aria-label], .a-size-base-plus, h2 a").first();
        if (!titleEl.length) continue;
        const title = titleEl.text().trim();
 
        const dealPrice = parsePrice($(card).find(".a-price .a-offscreen, .dealPriceText").first().text());
        const origPrice = parsePrice($(card).find(".a-text-price .a-offscreen, .originalPriceText").first().text());
 
        if (!dealPrice || !origPrice || origPrice <= dealPrice) continue;
        const discount = Math.round((1 - dealPrice / origPrice) * 100);
        if (discount < MIN_DISCOUNT_PCT) continue;
 
        const image    = $(card).find("img").first().attr("src") || "";
        const category = $(card).find(".a-color-secondary").first().text().trim() || "General";
        const expires  = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
 
        deals.push({
          id: asin,
          title: title.slice(0, 120),
          category,
          originalPrice: origPrice,
          dealPrice,
          discount,
          image,
          affiliate_url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
          store: "Amazon",
          expires,
          hot: discount >= 40,
          posted_at: new Date().toISOString(),
        });
 
        seen.add(asin);
        if (deals.length >= MAX_DEALS_PER_RUN) break;
      } catch (e) {
        // skip bad card
      }
    }
  } catch (err) {
    console.warn(`Scrape failed: ${err.message}`);
  }
 
  console.log(`Scraped ${deals.length} valid deals (≥${MIN_DISCOUNT_PCT}% off)`);
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
  console.log(`Saved ${newDeals.length} new deals → deals.json`);
  return newDeals.length;
}
 
(async () => {
  console.log("=".repeat(55));
  console.log(`🤖 DealsPulse Actions Bot — ${new Date().toUTCString()}`);
  const deals = await scrapeDeals();
  if (deals.length) {
    const saved = saveDeals(deals);
    console.log(`✅ Done: ${saved} new deals saved.`);
  } else {
    console.log("No qualifying deals found.");
  }
})();
