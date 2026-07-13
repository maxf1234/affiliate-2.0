/**
 * /prime — shareable Prime Student referral page.
 * Serves Open Graph tags (so WhatsApp/social show a rich preview with the
 * Prime banner), then forwards real visitors to the SPA's #/prime page.
 */

module.exports = async (req, res) => {
  const siteUrl = "https://" + req.headers.host;
  const shareUrl = siteUrl + "/prime";
  const hashUrl = siteUrl + "/#/prime";
  const image = siteUrl + "/prime-student.webp";

  const title = "🎓 6 Months of Amazon Prime — 100% FREE (Ages 18–24)";
  const description = "Free fast shipping, Prime Video, exclusive deals + 5% cash back. $0 for 6 full months — cancel anytime. Claim it before you turn 25!";

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />

  <!-- Open Graph (WhatsApp, Facebook) -->
  <meta property="og:type" content="website" />
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

  <meta http-equiv="refresh" content="0;url=${hashUrl}" />
  <script>window.location.href = "${hashUrl}";</script>
</head>
<body>
  <p>Loading... <a href="${hashUrl}">Click here</a></p>
</body>
</html>`);
};
