/**
 * Short link codes: every deal gets a permanent 5-digit number (10001,
 * 10002, …) used in WhatsApp links — dealspulse.co/10042 — while the long
 * deal id stays the internal key for tracking and dedupe.
 *
 * Codes are handed out in sequence and NEVER reused. Old WhatsApp messages
 * outlive the deals they point to; a reused code would send someone tapping
 * an old message to a different product. At ~45 new deals/day the 5-digit
 * range lasts about five years, after which codes simply grow to 6 digits.
 *
 * The counter lives in bot/codes.json, committed by every workflow that
 * creates deals (scraper, Add Deal). If that file is ever lost, the counter
 * restarts above the highest code still on the site, so no live code is
 * reused.
 */

const fs = require("fs");
const path = require("path");

const CODES_PATH = path.join(__dirname, "codes.json");
const FIRST_CODE = 10001;

function readNext(deals) {
  let next = FIRST_CODE;
  try {
    const saved = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
    if (Number.isInteger(saved.next)) next = saved.next;
  } catch (e) { /* first run */ }
  const highest = deals.reduce((m, d) => Math.max(m, Number(d.code) || 0), 0);
  return Math.max(next, highest + 1);
}

// Give every deal without a code the next number, oldest first so the
// numbering follows posting order. Mutates the deals; returns how many it
// assigned, and saves the counter when it assigned any.
function assignCodes(deals) {
  let next = readNext(deals);
  const missing = deals
    .filter(d => !Number.isInteger(d.code))
    .sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
  for (const d of missing) d.code = next++;
  if (missing.length) {
    fs.writeFileSync(CODES_PATH, JSON.stringify({ next }, null, 2) + "\n");
  }
  return missing.length;
}

module.exports = { assignCodes };
