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
 * A deal that leaves the site and returns keeps its original code (the
 * id -> code pairs are remembered in codes.json), so its old links revive
 * instead of dying.
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

// How many id -> code pairs to remember for deals no longer on the site.
// ~2 months at current volume; a deal that returns later than that is
// treated as new.
const MAX_REMEMBERED = 5000;

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
    return {
      next: Number.isInteger(saved.next) ? saved.next : FIRST_CODE,
      seen: saved.seen && typeof saved.seen === "object" ? saved.seen : {},
    };
  } catch (e) {
    return { next: FIRST_CODE, seen: {} }; // first run
  }
}

// Give every deal without a code a number, oldest first so the numbering
// follows posting order. A deal that dropped off the site and came back
// (expired then re-listed, or pushed out by the 200 cap) gets its ORIGINAL
// code again, so links already sent for it keep working. Mutates the deals;
// returns how many it assigned.
function assignCodes(deals) {
  const state = readState();
  const highest = deals.reduce((m, d) => Math.max(m, Number(d.code) || 0), 0);
  let next = Math.max(state.next, highest + 1);
  const seen = state.seen;
  const before = JSON.stringify(state);

  const missing = deals
    .filter(d => !Number.isInteger(d.code))
    .sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at));
  const live = new Set(deals.map(d => d.code).filter(Number.isInteger));
  for (const d of missing) {
    const old = seen[d.id];
    d.code = Number.isInteger(old) && !live.has(old) ? old : next++;
    live.add(d.code);
  }
  for (const d of deals) seen[d.id] = d.code;

  // Keep the newest MAX_REMEMBERED pairs (highest codes = most recent).
  const kept = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, MAX_REMEMBERED);
  const out = { next, seen: Object.fromEntries(kept.sort((a, b) => a[1] - b[1])) };
  if (JSON.stringify(out) !== before) {
    fs.writeFileSync(CODES_PATH, JSON.stringify(out) + "\n");
  }
  return missing.length;
}

module.exports = { assignCodes };
