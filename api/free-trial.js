/**
 * Vercel serverless function — shareable link for the Prime trial explainer.
 * URL: /free-trial  (rewritten to /api/free-trial)
 *
 * This is the link that goes out to the WhatsApp groups. The site is a
 * hash-routed SPA, so #/p/free-trial produces no preview when pasted into a
 * chat; this gives crawlers real meta tags on a clean URL and bounces humans
 * through to the page.
 *
 * No og:image on purpose: the only artwork that would fit here is Amazon's
 * own creative, which we are not licensed to use. The flyer is attached to the
 * WhatsApp message itself, so the preview does not need to carry one.
 */

const TITLE = "Getting Prime free before October's Big Deal Days";
const DESCRIPTION =
  "Three ways into a membership, what each costs once the free period ends, " +
  "and how to cancel if you only wanted it for the sale. An independent " +
  "explainer from DealsPulse.";

module.exports = async (req, res) => {
  const siteUrl = "https://" + req.headers.host;
  const pageUrl = siteUrl + "/#/p/free-trial";
  const shareUrl = siteUrl + "/free-trial";

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${TITLE} — DealsPulse</title>
  <meta name="description" content="${DESCRIPTION}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${TITLE}" />
  <meta property="og:description" content="${DESCRIPTION}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="og:site_name" content="DealsPulse" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${TITLE}" />
  <meta name="twitter:description" content="${DESCRIPTION}" />

  <meta http-equiv="refresh" content="0;url=${pageUrl}" />
  <script>window.location.href = "${pageUrl}";</script>
</head>
<body>
  <p>Redirecting… <a href="${pageUrl}">Click here</a></p>
</body>
</html>`);
};
