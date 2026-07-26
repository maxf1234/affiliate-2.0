/** Diagnostic: what exactly is inside the slickdeals RSS feed? */
const https = require("https"); const zlib = require("zlib");
function fetchPage(url, r = 0) {
  return new Promise((resolve, reject) => {
    if (r > 5) return reject(new Error("redirects"));
    const req = https.get(url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml,text/xml,*/*;q=0.8", "Accept-Encoding": "gzip, deflate" }}, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume(); return fetchPage(new URL(res.headers.location, url).toString(), r+1).then(resolve).catch(reject);
      }
      let s = res;
      if (res.headers["content-encoding"] === "gzip") s = res.pipe(zlib.createGunzip());
      else if (res.headers["content-encoding"] === "deflate") s = res.pipe(zlib.createInflate());
      let d = ""; s.on("data", c => d += c);
      s.on("end", () => resolve({ status: res.statusCode, body: d })); s.on("error", reject);
    });
    req.on("error", reject); req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}
(async () => {
  const { status, body } = await fetchPage("https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1");
  console.log(`RSS status=${status} len=${body.length}`);
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  console.log(`items: ${items.length}`);
  console.log("\n=== FIRST 2 ITEMS (raw) ===");
  items.slice(0, 2).forEach((it, i) => console.log(`--- item ${i} ---\n` + it.slice(0, 1500)));
  console.log("\n=== AMAZON URLS FOUND IN FEED ===");
  const urls = [...new Set([...body.matchAll(/https?:\/\/(?:www\.)?(?:amazon\.com|amzn\.to)[^"'\s<>&\]]*/g)].map(m => m[0]))];
  console.log(`unique: ${urls.length}`);
  urls.slice(0, 8).forEach(u => console.log("  " + u.slice(0, 160)));
  const dp = urls.filter(u => /\/dp\/|\/gp\/product\//.test(u));
  console.log(`with /dp/ ASIN: ${dp.length}`);
  dp.slice(0, 5).forEach(u => console.log("  ASIN " + u));
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
