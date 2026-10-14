/**
 * Tag a deal Men / Women / Unisex from explicit words in its title.
 *
 * Deliberately literal: it never infers from the product type. A "Floral
 * Midi Dress" says nothing explicit, so it is Unisex here — a wrong guess
 * would send it to the wrong WhatsApp audience, which is worse than leaving
 * it out. Kids' sizes (boys / girls) are not men's or women's deals, so they
 * stay Unisex too. Titles naming both, or "unisex", are Unisex.
 *
 * Used by the scraper (stored on each deal), manual Add Deal, and the
 * WhatsApp bot (fallback for deals stored before this field existed).
 */

// Straight or curly apostrophe: "Women's" and "Women’s" both appear in feeds.
const APOS = "['’]";
const WOMEN = new RegExp(`\\b(?:women|woman|ladies|lady)(?:${APOS}s)?\\b|\\bwomens\\b|\\bfor her\\b|\\bmaternity\\b`, "i");
// Bare "man" is excluded on purpose: Spider-Man, handyman, Iron Man.
const MEN = new RegExp(`\\bmen(?:${APOS}s)?\\b|\\bmens\\b|\\bman${APOS}s\\b|\\bfor him\\b`, "i");
const UNISEX = /\bunisex\b/i;

function guessGender(title) {
  const t = String(title || "");
  if (UNISEX.test(t)) return "Unisex";
  const w = WOMEN.test(t);
  const m = MEN.test(t);
  if (w && !m) return "Women";
  if (m && !w) return "Men";
  return "Unisex";
}

module.exports = { guessGender };
