
/**
 * Vercel serverless function — generates Open Graph meta tags per deal
 * URL: /api/deal?id=sd_abc123
 * WhatsApp/social crawlers hit this to get the preview image and title
 */
 
const https = require("https");
 
function fetchDeals() {
  return new Promise((resolve, reject) => {
    // Read deals.json from the public directory via raw GitHub
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
 
module.exports = async (req, res) => {
  const { id } = req.query;
  const deals = await fetchDeals();
  const deal = deals.find(d => d.id === id);
 
  if (!deal) {
    res.status(404).send("Deal not found");
    return;
  }
 
  const siteUrl = "https://" + req.headers.host;
  const dealUrl = siteUrl + "/#/deal/" + encodeURIComponent(deal.id);
  const title = deal.title + " - " + (deal.dealPrice > 0 ? "$" + deal.dealPrice.toFixed(2) : "Great Deal") + " | DealsPulse";
  const description = (deal.discount > 0 ? deal.discount + "% OFF! " : "") +
    (deal.originalPrice > 0 ? "Was $" + deal.originalPrice.toFixed(2) + ", now $" + deal.dealPrice.toFixed(2) + ". " : "") +
    "Shop this deal on Amazon via DealsPulse.";
  const image = deal.image || "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=80";
 
  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
 
  <!-- Open Graph (WhatsApp, Facebook) -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="500" />
  <meta property="og:image:height" content="500" />
  <meta property="og:url" content="${dealUrl}" />
  <meta property="og:site_name" content="DealsPulse" />
 
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
 
  <!-- Redirect to the actual deal page after crawlers have read the meta tags -->
  <meta http-equiv="refresh" content="0;url=${dealUrl}" />
  <script>window.location.href = "${dealUrl}";</script>
</head>
<body>
  <p>Redirecting to deal... <a href="${dealUrl}">Click here</a></p>
</body>
</html>`);
};
 
