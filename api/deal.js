/**
 * Vercel serverless function — generates Open Graph meta tags per deal
 * URL: /share/deal/:id  (rewritten to /api/deal?id=:id)
 * WhatsApp/social crawlers hit this to get the preview image and title.
 */

const https = require("https");

function fetchDeals() {
  return new Promise((resolve) => {
    const url = "https://raw.githubusercontent.com/maxf1234/affiliate-2.0/main/public/deals.json";
    https.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve([]); }
      });
    }).on("error", () => resolve([]));
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = async (req, res) => {
  const { id } = req.query;
  const deals = await fetchDeals();
  const deal = deals.find(d => d.id === id);

  if (!deal) {
    res.status(404).send("Deal not found");
    return;
  }

  const siteUrl = "https://" + req.headers.host;
  const shareUrl = siteUrl + "/share/deal/" + encodeURIComponent(deal.id);
  const hashUrl = siteUrl + "/#/deal/" + encodeURIComponent(deal.id);

  const title = escapeHtml(
    deal.title + " - " + (deal.dealPrice > 0 ? "$" + deal.dealPrice.toFixed(2) : "Great Deal") + " | DealsPulse"
  );
  const description = escapeHtml(
    (deal.discount > 0 ? deal.discount + "% OFF! " : "") +
    (deal.originalPrice > 0 ? "Was $" + deal.originalPrice.toFixed(2) + ", now $" + deal.dealPrice.toFixed(2) + ". " : "") +
    "Shop this deal on Amazon via DealsPulse."
  );

  // Use the real product image. No hardcoded width/height — let WhatsApp detect
  // the true dimensions so it doesn't reject a size mismatch and fall back to a
  // tiny preview.
  const image = escapeHtml(deal.image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80");

  res.setHeader("Content-Type", "text/html");
  // Let crawlers cache, but allow refresh
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <!-- Open Graph (WhatsApp, Facebook) -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:secure_url" content="${image}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:site_name" content="DealsPulse" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />

  <!-- Send real visitors to the deal page after crawlers read the meta tags -->
  <meta http-equiv="refresh" content="0;url=${hashUrl}" />
  <script>window.location.href = "${hashUrl}";</script>
</head>
<body>
  <p>Redirecting to deal... <a href="${hashUrl}">Click here</a></p>
</body>
</html>`);
};
