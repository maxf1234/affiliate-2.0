# ⚡ DealsPulse — Affiliate Deals Website + Bot

Automatically finds Amazon deals, publishes them to your website, and drips them into your WhatsApp groups — with per-deal, per-channel click tracking.

-----

## How It Works

```
GitHub Action (hourly)
  │
  ├─ bot/bot_actions.js scrapes 3 sources:
  │      stundeals · savecrazydeals · bensbargains
  │    · swaps in your affiliate tag
  │    · keeps only deals ≥ MIN_DISCOUNT_PCT off
  │    · fixes titles/categories, dedupes by ASIN
  │    · purges expired deals
  ├─ writes public/deals.json, commits, pushes
  └─ Vercel redeploys the website ✅

WhatsApp bot (bot/bot.js — runs on your machine / Railway)
  └─ posts 1 new deal per hour to your groups, linking to the site (?src=wa)

WhatsApp deal links (/api/go?id=X&src=wa&to=site)
  └─ count the tap  →  redirect to the deal page on the site
       └─ view counts at /api/stats
Website "Get Deal" buttons link straight to Amazon (plain affiliate link)
```

-----

## Project Structure

```
├── index.html            ← SEO meta + favicon
├── vercel.json           ← rewrites (/share/deal/:id → /api/deal, /student-trial)
├── public/
│   └── deals.json        ← bot writes here; website reads this
├── src/
│   └── App.jsx           ← the website (React + Vite)
├── api/
│   ├── go.js             ← affiliate click redirect + tracking
│   ├── stats.js          ← private click-stats JSON
│   ├── deal.js           ← OG meta tags for shared links
│   ├── student-trial.js  ← OG meta tags for the membership explainer
│   └── img.js            ← image proxy for link previews
├── bot/
│   ├── bot_actions.js    ← hourly scraper (runs in GitHub Actions)
│   └── bot.js            ← WhatsApp announcer (runs locally / Railway)
└── .github/workflows/bot.yml
```

-----

## Click Tracking Setup (one-time, ~2 minutes)

1. In your Vercel project: **Storage → Create Database → Upstash Redis** (free tier).
   Vercel auto-adds `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) — both naming schemes work.
2. (Recommended) Add a `STATS_KEY` env var in Vercel with any secret string.
3. View your numbers at `https://YOUR-SITE/api/stats?key=YOUR_STATS_KEY`:
   - total clicks, clicks by source (`site` grid / `deal` page / `share` links / `wa` WhatsApp)
   - clicks per day (last 14 days)
   - all-time top 25 most-clicked deals

Until Redis is set up, redirects still work and clicks are visible in Vercel function logs.

-----

## Referral Page (Prime student / 18–24 trial)

Shareable URL: **`https://YOUR-SITE/student-trial`** (in-app route: `#/p/student-trial`).

The referral link itself lives in **`api/go.js`**, in the `REFERRAL_LINKS` map —
change it there and nowhere else. Taps are counted under the deal id
`student-trial`, so they show up in `/api/stats` alongside normal deal clicks.

Compliance notes, so a future edit does not undo them:

- **No Amazon artwork.** Amazon's own creative (logos, the smile, Prime
  wordmark art, screenshots) is licensed to Amazon, not to us. The page is
  text-only and the share preview has no `og:image` on purpose.
- **No stated price or trial length.** Amazon sets both and changes them
  without notice; publishing a specific figure risks misstating their terms.
  The copy describes how the offer works and sends the reader to Amazon for
  the live terms.
- **The disclosure is not optional.** It is rendered by the `ArticleCta`
  component itself, so a CTA cannot ship without it.
- Deal pages link to *this page*, never straight to the referral link, so
  nobody reaches the sign-up without seeing the terms first.

-----

## Scraper Configuration (GitHub Actions)

Secrets (repo → Settings → Secrets → Actions):

| Secret | Purpose |
|---|---|
| `GH_TOKEN` | push access for the bot commit |

Tuning (in `.github/workflows/bot.yml`):

The Amazon Associates tag lives in plain sight in `bot.yml`
(`AMAZON_AFFILIATE_TAG: 'dealspulse06-20'`) — affiliate tags are public,
so to change it, edit that one line. No GitHub secret involved.

| Env | Default | Meaning |
|---|---|---|
| `MAX_DEALS_PER_RUN` | 25 | max new deals saved per run |
| `MIN_DISCOUNT_PCT` | 25 | discard deals below this discount |
| `SCD_PAGE_FETCH_LIMIT` | 15 | savecrazydeals product pages fetched per run |
| `BB_MAX_PER_BOX` | 3 | max products taken from one bensbargains roundup |

**bensbargains note:** most of its deals route outbound clicks through a POST
click-tracker, so no Amazon URL is readable and those are skipped by design.
Usable deals come from posts that publish real `amazon.com/dp/…` links
(typically brand roundups), so expect a handful per run — sometimes none.

Each source runs independently: if one breaks, the others still save deals and
the run logs a warning. The workflow only **fails loudly** (and emails you) when
*every* source fails.

-----

## Add a Deal Manually

GitHub → **Actions** → **Add Deal** → **Run workflow**. Fill in the form
(Amazon link + title + price are required; original price, category, image,
and expiry are optional) and run it. The deal is added to `public/deals.json`
(newest-first, your affiliate tag applied, category auto-guessed if left on
Auto), committed, and the site redeploys — after which the WhatsApp bot can
post it like any other deal. Works from your phone. Manually added deals get a
`man_` id and a `"manual": true` flag.

**Image:** leave it blank and the workflow tries to fetch the product image
from the Amazon page; if Amazon blocks the fetch it falls back to a
placeholder, so pasting an image URL is the reliable option.

**Post it next:** set "Post this deal to WhatsApp next?" to `yes` and the deal
is flagged `priority` so the bot posts it ahead of its normal pick.

## Choose the Next WhatsApp Deal

GitHub → **Actions** → **Post Deal Next** → **Run workflow**. Enter a deal id
(`man_…` / `sd_…` / `sc_…`) or part of a title; that deal is flagged `priority`
(and priority is cleared from others unless you keep them), so the bot posts it
on its next scheduled run, ahead of the usual oldest / best-discount pick.
Requires the bot to be running the current code (redeploy on Railway once).

## Remove a Deal Manually

GitHub → **Actions** → **Remove Deal** → **Run workflow**. Enter a deal id, an
ASIN, or part of a title. It matches on id first, then ASIN, then title, and
**refuses to run unless exactly one deal matches** — an ambiguous search lists
the candidates and stops rather than guessing. Set "Only show what would be
removed" to `yes` to see the match without changing anything.

The deal (and any other entry for the same product) is dropped from
`public/deals.json`, committed, and the site redeploys.

**Why it doesn't come back:** the scraper de-dupes against what's currently in
`deals.json`, so a product you delete looks brand new to it and returns on the
next run. Removals are therefore also recorded in `bot/removed.json`, which
`saveDeals()` checks before saving. To remove a deal *without* blocking it —
e.g. it's genuinely expired and you'd take it again later at a better price —
set "Also stop the scraper re-adding this product?" to `no`. To un-block
something, delete its entry from `bot/removed.json`.

Already-sent WhatsApp messages can't be recalled; removal only affects the site
and future posts.

-----

## WhatsApp Bot

Built on [Baileys](https://github.com/WhiskeySockets/Baileys) — a protocol-level
WhatsApp client (no browser), so it doesn't break when WhatsApp updates its web app.

```bash
cd bot
npm install
node bot.js
```

Link once: set `WHATSAPP_PHONE` (digits + country code, e.g. `15551234567`) and the
bot prints an 8-character **pairing code** — enter it on your phone under
WhatsApp → Linked Devices → Link a Device → "Link with phone number instead".
Leave `WHATSAPP_PHONE` unset to scan a QR instead. Auth persists on the `/data`
volume, so relinking is only needed if WhatsApp logs the session out.

`.env` options: `DEALS_URL`, `SITE_BASE`, `SCAN_INTERVAL_MIN`, `BOT_TIMEZONE`,
`WHATSAPP_PHONE`, `WHATSAPP_GROUPS`, `THRICE_DAILY_GROUPS`,
`THRICE_DAILY_CATEGORIES`, `GROUP_LINK` (invite link).

Each `WHATSAPP_GROUPS` / `THRICE_DAILY_GROUPS` entry can be a **group-name
substring** or a raw **group id** (`…@g.us`). Ids are break-proof — they keep
working even when a WhatsApp web-app update breaks name lookup. The bot prints
every group's id at startup (`"<name>" -> <id>@g.us`); paste those ids into the
variables for a config that survives WhatsApp changes.

The bot links to your site's share pages tagged `?src=wa`, so WhatsApp-driven clicks
show up separately in `/api/stats`.

-----

## Tips

- **Amazon PA-API**: once your Associates account has 3+ qualifying sales, you can move
  sourcing to the official [PA-API 5.0](https://webservices.amazon.com/paapi5/documentation/)
  — more reliable than scraping. The scraper is isolated in `bot/bot_actions.js`, so it's
  a drop-in swap.
- Check `/api/stats` weekly: double down on the categories people actually click.
- The affiliate disclosure in the site footer is required by Amazon Associates policy — keep it.
