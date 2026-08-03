/**
 * Remove a single deal from public/deals.json by hand.
 *
 * Driven by the "Remove Deal" GitHub Actions workflow, or runnable locally:
 *   FIND="airpods" node bot/remove_deal.js
 *   FIND="man_B0CX23V2ZK" node bot/remove_deal.js
 *   FIND="B0CX23V2ZK" BLOCK=no node bot/remove_deal.js
 *
 * Matching mirrors post_next.js: exact id, then exact ASIN, then a title
 * substring — and it refuses to act unless exactly one deal matches, so a
 * vague search can never delete the wrong product.
 *
 * By default the removed product is also written to bot/removed.json, which
 * the scraper checks before saving. Without that the deal comes straight back
 * on the next scheduled run: saveDeals() de-dupes against what is currently in
 * deals.json, so a product you just deleted looks brand new to it.
 */

const fs = require("fs");
const path = require("path");
const { extractAsin } = require("./bot_actions.js");

const DEALS_JSON_PATH   = path.join(__dirname, "..", "public", "deals.json");
const BLOCKLIST_PATH    = path.join(__dirname, "removed.json");
const MAX_BLOCKLIST     = 500;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function dealAsin(d) {
  return d.asin || extractAsin(d.affiliate_url || "") || null;
}

(function main() {
  const find = (process.env.FIND || "").trim();
  // Default on: removing a deal that reappears in half an hour isn't a removal.
  const block  = !/^(0|false|no)$/i.test((process.env.BLOCK || "yes").trim());
  const dryRun = /^(1|true|yes)$/i.test((process.env.DRY_RUN || "").trim());
  if (!find) fail("FIND is required — a deal id, an ASIN, or part of the title.");

  let deals;
  try {
    deals = JSON.parse(fs.readFileSync(DEALS_JSON_PATH, "utf8"));
  } catch (e) {
    fail(`Could not read deals.json: ${e.message}`);
  }
  if (!Array.isArray(deals) || !deals.length) fail("deals.json holds no deals.");

  const q = find.toLowerCase();
  let matches = deals.filter(d => (d.id || "").toLowerCase() === q);
  let matchedBy = "id";
  if (!matches.length) {
    matches = deals.filter(d => (dealAsin(d) || "").toLowerCase() === q);
    matchedBy = "ASIN";
  }
  if (!matches.length) {
    matches = deals.filter(d => (d.title || "").toLowerCase().includes(q));
    matchedBy = "title";
  }

  if (!matches.length) {
    console.error(`No deal matched "${find}". A few current titles:`);
    deals.slice(0, 10).forEach(d => console.error(`  - [${d.id}] ${d.title}`));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${find}" matched ${matches.length} deals — re-run with one of these ids:`);
    matches.slice(0, 12).forEach(d => console.error(`  - [${d.id}] ${d.title}`));
    process.exit(1);
  }

  const target = matches[0];
  const asin = dealAsin(target);

  console.log(`Matched by ${matchedBy}: [${target.id}] ${target.title}`);
  console.log(`  $${target.dealPrice}${target.originalPrice ? ` (was $${target.originalPrice})` : ""} | ${target.category} | asin=${asin || "none"}`);

  if (dryRun) {
    console.log("DRY_RUN — nothing written. Re-run without dry run to remove it.");
    return;
  }

  // Drop the deal, plus anything else pointing at the same product.
  const remaining = deals.filter(d => {
    if (d.id === target.id) return false;
    if (asin && dealAsin(d) === asin) return false;
    return true;
  });
  const removed = deals.length - remaining.length;

  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(remaining, null, 2));

  if (block) {
    let list = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(BLOCKLIST_PATH, "utf8"));
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) { /* first removal — start empty */ }

    // Re-removing the same product refreshes its entry rather than duplicating.
    list = list.filter(e => e.id !== target.id && !(asin && e.asin === asin));
    list.unshift({
      id: target.id,
      asin,
      title: (target.title || "").slice(0, 120),
      removed_at: new Date().toISOString(),
    });
    list = list.slice(0, MAX_BLOCKLIST);

    fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify(list, null, 2));
    console.log(`Blocked from returning (bot/removed.json now holds ${list.length} entr${list.length === 1 ? "y" : "ies"}).`);
  } else {
    console.log("BLOCK=no — the scraper may re-add this product on its next run.");
  }

  console.log(`Removed ${removed} deal(s). Total deals: ${remaining.length}`);
})();
