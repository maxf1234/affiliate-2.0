/** Find an Amazon-filtered slickdeals RSS feed with better yield. */
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
const B = "https://slickdeals.net/newsearch.php";
const candidates = [
  `${B}?mode=frontpage&searcharea=deals&searchin=first&rss=1`,
  `${B}?searcharea=deals&searchin=first&rss=1&store=1`,
  `${B}?mode=frontpage&searcharea=deals&searchin=first&rss=1&store=1`,
  `${B}?searcharea=deals&searchin=first&rss=1&store=1&sort=newest`,
  `${B}?searcharea=deals&searchin=first&rss=1&q=amazon`,
  `${B}?searcharea=deals&searchin=first&rss=1&store=1&forumchoice[]=9`,
  "https://slickdeals.net/deals/amazon/?rss=1",
];
(async () => {
  for (const url of candidates) {
    try {
      const { status, body } = await fetchPage(url);
      const items = (body.match(/<item>/g) || []).length;
      const amazonItems = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .filter(m => /data-store-slug="amazon"|trd=Amazon/i.test(m[1])).length;
      const withAsin = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .filter(m => /data-aps-asin="[A-Z0-9]{10}"/i.test(m[1])).length;
      console.log(`${status} | items=${String(items).padStart(3)} | amazon=${String(amazonItems).padStart(3)} | withASIN=${String(withAsin).padStart(3)} | ${url.replace(B,'…')}`);
    } catch (e) { console.log(`ERR ${e.message} | ${url.replace(B,'…')}`); }
  }
})();
