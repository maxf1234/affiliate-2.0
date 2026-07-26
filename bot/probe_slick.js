/** Diagnostic probe for slickdeals.net — are merchant URLs ever exposed? */
const https = require("https");
const zlib = require("zlib");

function fetchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const req = https.get(url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate",
    }}, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).toString();
        console.log(`  redirect ${res.statusCode} -> ${next.slice(0,120)}`);
        res.resume();
        return fetchPage(next, redirects + 1).then(resolve).catch(reject);
      }
      let s = res;
      if (res.headers["content-encoding"] === "gzip") s = res.pipe(zlib.createGunzip());
      else if (res.headers["content-encoding"] === "deflate") s = res.pipe(zlib.createInflate());
      let d = ""; s.on("data", c => d += c);
      s.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
      s.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

(async () => {
  const home = await fetchPage("https://slickdeals.net");
  console.log(`homepage: ${home.status}, ${home.body.length} bytes`);

  // What do deal cards link to?
  const hrefs = [...home.body.matchAll(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*dealCard[^"]*"/g)].map(m => m[1]);
  const hrefs2 = [...home.body.matchAll(/class="[^"]*dealCard__title[^"]*"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  const all = [...new Set([...hrefs, ...hrefs2])];
  console.log(`dealCard links found: ${all.length}`);
  all.slice(0, 5).forEach(h => console.log("  " + h.slice(0, 140)));

  // Any /f/ deal-page links at all?
  const fLinks = [...new Set([...home.body.matchAll(/href="(\/f\/\d+[^"]*)"/g)].map(m => m[1]))];
  console.log(`/f/ deal pages: ${fLinks.length}`);
  fLinks.slice(0, 3).forEach(h => console.log("  " + h.slice(0, 120)));

  // Follow one deal page and hunt for merchant links
  if (fLinks.length) {
    const url = "https://slickdeals.net" + fLinks[0];
    console.log(`\n=== DEAL PAGE: ${url} ===`);
    const dp = await fetchPage(url);
    console.log(`status=${dp.status} len=${dp.body.length}`);
    const amz = [...new Set([...dp.body.matchAll(/https?:\/\/(?:www\.)?(?:amazon\.com|amzn\.to)[^"'\s<)\\]*/g)].map(m => m[0]))];
    console.log(`amazon links on deal page: ${amz.length}`);
    amz.slice(0, 5).forEach(u => console.log("  " + u.slice(0, 150)));
    const store = dp.body.match(/"store"\s*:\s*"([^"]+)"/i) || dp.body.match(/dealDetailsOutclickButton[^>]*href="([^"]+)"/i);
    console.log(`store/outclick hint: ${store ? store[0].slice(0, 160) : "none"}`);
  }

  // RSS feed?
  for (const c of ["/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1", "/rss/frontpage"]) {
    try {
      const r = await fetchPage("https://slickdeals.net" + c);
      const amazon = (r.body.match(/amazon\.com/g) || []).length;
      console.log(`${c.slice(0,40)} -> ${r.status} | ${r.body.length}b | amazon=${amazon}`);
    } catch (e) { console.log(`${c.slice(0,40)} -> ERROR ${e.message}`); }
  }
})().catch(e => { console.error("PROBE FAILED:", e.message); process.exit(1); });
