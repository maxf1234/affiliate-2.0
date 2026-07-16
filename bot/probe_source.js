/**
 * Diagnostic probe for a prospective deal source.
 * Runs in GitHub Actions (workflow_dispatch) and prints structural info
 * about a page so a parser can be written against real data.
 *
 *   PROBE_URL=https://savecrazydeals.com node probe_source.js
 */

const https = require("https");
const http = require("http");
const zlib = require("zlib");

const URL_TO_PROBE = process.env.PROBE_URL || "https://savecrazydeals.com";

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
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        console.log(`Redirect ${res.statusCode} -> ${next}`);
        return fetchPage(next, redirects + 1).then(resolve).catch(reject);
      }
      let stream = res;
      const enc = res.headers["content-encoding"];
      if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
      else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
      let data = "";
      stream.on("data", chunk => data += chunk);
      stream.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      stream.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

(async () => {
  console.log(`PROBING: ${URL_TO_PROBE}`);
  const { status, headers, body } = await fetchPage(URL_TO_PROBE);
  console.log(`STATUS: ${status}`);
  console.log(`SERVER: ${headers.server || "?"} | CONTENT-TYPE: ${headers["content-type"] || "?"}`);
  console.log(`LENGTH: ${body.length} bytes`);

  if (status !== 200) {
    console.log("BODY (first 800):");
    console.log(body.slice(0, 800));
    process.exit(0);
  }

  // Platform markers
  console.log("--- PLATFORM MARKERS ---");
  const gen = body.match(/<meta name="generator" content="([^"]+)"/i);
  console.log("generator meta:", gen ? gen[1] : "none");
  console.log("wp-content refs:", count(body, "wp-content"));
  console.log("__NEXT_DATA__:", count(body, "__NEXT_DATA__"));
  console.log("self.__next_f:", count(body, "self.__next_f"));
  console.log("shopify refs:", count(body.toLowerCase(), "shopify"));
  console.log("woocommerce refs:", count(body.toLowerCase(), "woocommerce"));

  // Link formats
  console.log("--- LINKS ---");
  console.log("amzn.to links:", count(body, "amzn.to"));
  console.log("amazon.com links:", count(body, "amazon.com"));
  const amzn = [...body.matchAll(/https?:\/\/(?:www\.)?(?:amzn\.to|amazon\.com)[^"'\s<)\\]*/g)].map(m => m[0]);
  [...new Set(amzn)].slice(0, 6).forEach(u => console.log("  link:", u.slice(0, 130)));

  // Price patterns
  console.log("--- PRICES ---");
  const prices = [...body.matchAll(/\$\d+\.?\d{0,2}/g)].map(m => m[0]);
  console.log("$ occurrences:", prices.length, "| sample:", [...new Set(prices)].slice(0, 12).join(" "));

  // Repeated structural elements — find likely deal-card class names
  console.log("--- COMMON CLASSES (top candidates) ---");
  const classCounts = {};
  for (const m of body.matchAll(/class="([^"]{3,80})"/g)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls.length < 4) continue;
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }
  }
  Object.entries(classCounts)
    .filter(([c, n]) => n >= 5 && /prod|deal|item|card|post|price|title|sale|offer|entry/i.test(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([c, n]) => console.log(`  .${c} x${n}`));

  // Embedded JSON-LD
  console.log("--- JSON-LD BLOCKS ---");
  const ld = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  console.log("count:", ld.length);
  ld.slice(0, 2).forEach((m, i) => console.log(`  [${i}] ${m[1].slice(0, 300).replace(/\s+/g, " ")}`));

  // Sample of the body around the first amzn link for structure context
  console.log("--- CONTEXT AROUND FIRST AMAZON LINK ---");
  const idx = body.search(/amzn\.to|amazon\.com/);
  if (idx > 0) console.log(body.slice(Math.max(0, idx - 1200), idx + 400).replace(/\s+/g, " ").slice(0, 1600));

  // WordPress REST probe
  try {
    const api = new URL("/wp-json/wp/v2/posts?per_page=2", URL_TO_PROBE).toString();
    const r = await fetchPage(api);
    console.log("--- WP REST /wp-json/wp/v2/posts ---");
    console.log("status:", r.status, "| first 600 chars:", r.body.slice(0, 600).replace(/\s+/g, " "));
  } catch (e) {
    console.log("WP REST probe failed:", e.message);
  }
})().catch(e => {
  console.error("PROBE FAILED:", e.message);
  process.exit(1);
});
