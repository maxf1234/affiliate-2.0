/**
 * Targeted probe for bensbargains.com — dumps full JSON-LD Product blocks and
 * tests candidate feed/section URLs, so a parser can be written against the
 * real structure. Diagnostic only; never writes deals.json.
 */

const https = require("https");
const http = require("http");
const zlib = require("zlib");

function fetchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location : new URL(res.headers.location, url).toString();
        res.resume();
        return fetchPage(next, redirects + 1).then(resolve).catch(reject);
      }
      let stream = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      let data = "";
      stream.on("data", c => data += c);
      stream.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

(async () => {
  const base = "https://bensbargains.com";

  // 1) Full JSON-LD from the homepage
  console.log("=== HOMEPAGE JSON-LD (full) ===");
  const { body } = await fetchPage(base);
  const blocks = [...body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(`blocks: ${blocks.length}`);
  blocks.slice(0, 3).forEach((m, i) => {
    console.log(`--- block ${i} ---`);
    console.log(m[1].trim().slice(0, 1800));
  });

  // 2) How many dealboxes and what a single one looks like
  console.log("\n=== ONE DEALBOX SNIPPET ===");
  const dbIdx = body.indexOf('class="dealbox');
  if (dbIdx > 0) console.log(body.slice(dbIdx - 200, dbIdx + 2600).replace(/\s+/g, " "));

  // 3) Candidate feeds / Amazon sections
  const candidates = [
    "/feed/", "/rss", "/rss.xml", "/feeds/frontpage.rss", "/feed/frontpage",
    "/store/amazon-com/", "/store/amazon/", "/stores/amazon/",
    "/deals/", "/frontpage/", "/hot-deals/",
  ];
  console.log("\n=== CANDIDATE URLS ===");
  for (const c of candidates) {
    const url = base + c;
    try {
      const r = await fetchPage(url);
      const isFeed = /xml|rss/i.test(r.headers["content-type"] || "") || r.body.trimStart().startsWith("<?xml");
      const amazonCount = (r.body.match(/amazon\.com/g) || []).length;
      const ldCount = (r.body.match(/application\/ld\+json/g) || []).length;
      console.log(`${c} -> ${r.status} | ${(r.headers["content-type"]||"?").slice(0,40)} | ${r.body.length}b | feed=${isFeed} | amazon=${amazonCount} | ld=${ldCount}`);
    } catch (e) {
      console.log(`${c} -> ERROR ${e.message}`);
    }
  }
})().catch(e => { console.error("PROBE FAILED:", e.message); process.exit(1); });
