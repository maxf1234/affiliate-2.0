/**
 * Vercel serverless function — shareable link for the membership explainer.
 * URL: /student-trial  (rewritten to /api/student-trial)
 *
 * The site is a hash-routed SPA, so #/p/student-trial produces no preview when
 * pasted into WhatsApp. This gives crawlers real meta tags on a clean URL and
 * bounces humans through to the page itself.
 *
 * No og:image on purpose: the only artwork that would fit here is Amazon's own
 * creative, which we are not licensed to use. A text-only preview is fine.
 */

const TITLE = "A cheaper route into Prime for students and 18–24s";
const DESCRIPTION =
  "What the offer is, who qualifies, what happens when the free trial ends, " +
  "and how to cancel. An independent explainer from DealsPulse.";

module.exports = async (req, res) => {
  const siteUrl = "https://" + req.headers.host;
  const pageUrl = siteUrl + "/#/p/student-trial";
  const shareUrl = siteUrl + "/student-trial";

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
