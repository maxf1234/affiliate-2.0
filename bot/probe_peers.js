/** Diagnostic: how do compliant Associates sites handle Amazon marks + content? */
const https = require("https"); const zlib = require("zlib");
function fetchPage(url, r = 0) {
  return new Promise((resolve, reject) => {
    if (r > 5) return reject(new Error("redirects"));
    const req = https.get(url, { headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,*/*;q=0.8", "Accept-Encoding": "gzip, deflate" }}, res => {
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
const sites = ["https://www.dansdeals.com","https://bensbargains.com","https://slickdeals.net","https://www.stundeals.com"];
(async () => {
  for (const url of sites) {
    try {
      const { status, body } = await fetchPage(url);
      const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1].replace(/\s+/g," ").trim();
      const desc  = (body.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [,""])[1].slice(0,120);
      const pages = ["about","privacy","contact","disclosure","disclaimer","terms","how-we"]
        .filter(p => new RegExp(`href="[^"]*${p}[^"]*"`, "i").test(body));
      console.log(`\n=== ${url} (${status}) ===`);
      console.log(`title: ${title}`);
      console.log(`meta desc: ${desc}`);
      console.log(`"amazon" in title: ${/amazon/i.test(title)} | in meta desc: ${/amazon/i.test(desc)}`);
      console.log(`policy pages linked: ${pages.join(", ") || "none found"}`);
      const disc = body.match(/[^<>]{0,90}As an Amazon Associate[^<>]{0,90}/i);
      console.log(`disclosure: ${disc ? disc[0].replace(/\s+/g," ").trim() : "not on homepage"}`);
      console.log(`amazon logo imgs: ${(body.match(/<img[^>]+(amazon|prime)[^>]*logo[^>]*>/gi)||[]).length}`);
      const words = body.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().split(" ").length;
      console.log(`approx visible words: ${words}`);
    } catch (e) { console.log(`\n=== ${url} === ERROR ${e.message}`); }
  }
})();
