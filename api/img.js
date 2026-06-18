/**
 * Image proxy — fetches an Amazon (or other) product image server-side and
 * re-serves it from our own domain, so WhatsApp/Facebook crawlers that won't
 * hotlink directly from Amazon still get a valid og:image.
 *
 * URL: /api/img?u=<url-encoded image url>
 */

const https = require("https");

module.exports = async (req, res) => {
  const { u } = req.query;
  if (!u) {
    res.status(400).send("Missing image url");
    return;
  }

  let target;
  try {
    target = decodeURIComponent(u);
  } catch (e) {
    target = u;
  }

  // Only allow proxying known-safe image hosts
  if (!/^https:\/\/[^/]*(media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com|unsplash\.com)/.test(target)) {
    res.status(400).send("Host not allowed");
    return;
  }

  https.get(target, {
    headers: {
      // Pretend to be a normal browser so Amazon serves the image
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*",
      "Referer": "https://www.amazon.com/",
    }
  }, upstream => {
    if (upstream.statusCode !== 200) {
      res.status(502).send("Upstream image error");
      upstream.resume();
      return;
    }
    res.setHeader("Content-Type", upstream.headers["content-type"] || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400"); // cache 1 day
    upstream.pipe(res);
  }).on("error", () => {
    res.status(502).send("Fetch failed");
  });
};
