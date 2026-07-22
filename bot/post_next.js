/**
 * Choose which EXISTING deal the WhatsApp bot posts next.
 *
 * Driven by the "Post Deal Next" GitHub Actions workflow. Finds a deal in
 * public/deals.json by id or by a title search, flags it `priority: true`,
 * and (unless kept) clears priority from all other deals so exactly one is
 * queued. The bot posts the newest-flagged priority deal before its normal
 * pick on the next scheduled run.
 *
 * Local:
 *   FIND="airpods" node bot/post_next.js
 *   FIND="man_B0CX23V2ZK" node bot/post_next.js
 */

const fs = require("fs");
const path = require("path");

const DEALS_JSON_PATH = path.join(__dirname, "..", "public", "deals.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

(function main() {
  const find = (process.env.FIND || "").trim();
  const keepOthers = /^(1|true|yes)$/i.test((process.env.KEEP_OTHERS || "").trim());
  if (!find) fail("FIND is required — a deal id or part of the title.");

  let deals;
  try {
    deals = JSON.parse(fs.readFileSync(DEALS_JSON_PATH, "utf8"));
  } catch (e) {
    fail(`Could not read deals.json: ${e.message}`);
  }

  const q = find.toLowerCase();
  let matches = deals.filter(d => d.id.toLowerCase() === q);
  if (!matches.length) matches = deals.filter(d => (d.title || "").toLowerCase().includes(q));

  if (!matches.length) {
    console.error(`No deal matched "${find}". A few current titles:`);
    deals.slice(0, 10).forEach(d => console.error(`  - [${d.id}] ${d.title}`));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`"${find}" matched ${matches.length} deals — be more specific or use the id:`);
    matches.slice(0, 12).forEach(d => console.error(`  - [${d.id}] ${d.title}`));
    process.exit(1);
  }

  const target = matches[0];
  let cleared = 0;
  for (const d of deals) {
    if (d.id === target.id) continue;
    if (d.priority && !keepOthers) { delete d.priority; cleared++; }
  }
  target.priority = true;
  // Freshen posted_at so it wins "newest-flagged" among any kept priorities.
  target.posted_at = new Date().toISOString();

  fs.writeFileSync(DEALS_JSON_PATH, JSON.stringify(deals, null, 2));

  console.log(`Queued next for WhatsApp: [${target.id}] ${target.title}`);
  if (cleared) console.log(`Cleared priority from ${cleared} other deal(s).`);
  console.log("It will post on the bot's next scheduled run (if not already announced).");
})();
