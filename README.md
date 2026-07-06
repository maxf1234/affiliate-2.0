# ⚡ DealsPulse — Affiliate Deals Website + Bot

Automatically finds Amazon deals, publishes them to your website, and drips them into your WhatsApp groups — with per-deal, per-channel click tracking.

-----

## How It Works

```
GitHub Action (hourly)
  │
  ├─ bot/bot_actions.js scrapes stundeals.com
  │    · swaps in your affiliate tag
  │    · keeps only deals ≥ MIN_DISCOUNT_PCT off
  │    · fixes titles/categories, dedupes by ASIN
  │    · purges expired deals
  ├─ writes public/deals.json, commits, pushes
  └─ Vercel redeploys the website ✅

WhatsApp bot (bot/bot.js — runs on your machine / Railway)
  └─ posts 1 new deal per hour to your groups, linking to the site (?src=wa)

Every "Get Deal" click
  └─ /api/go?id=X&src=Y  →  counts the click  →  302 to Amazon
       └─ view counts at /api/stats
```

-----

## Project Structure

```
├── index.html            ← SEO meta + favicon
├── vercel.json           ← rewrites (/share/deal/:id → /api/deal)
├── public/
│   └── deals.json        ← bot writes here; website reads this
├── src/
│   └── App.jsx           ← the website (React + Vite)
├── api/
│   ├── go.js             ← affiliate click redirect + tracking
│   ├── stats.js          ← private click-stats JSON
│   ├── deal.js           ← OG meta tags for shared links
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

## Scraper Configuration (GitHub Actions)

Secrets (repo → Settings → Secrets → Actions):

| Secret | Purpose |
|---|---|
| `GH_TOKEN` | push access for the bot commit |
| `AMAZON_AFFILIATE_TAG` | your Associates tag, e.g. `maxdeals062-20` |

Tuning (in `.github/workflows/bot.yml`):

| Env | Default | Meaning |
|---|---|---|
| `MAX_DEALS_PER_RUN` | 25 | max new deals saved per run |
| `MIN_DISCOUNT_PCT` | 25 | discard deals below this discount |

If stundeals.com changes its markup, the workflow **fails loudly** and GitHub emails you — no more silent pipeline death.

-----

## WhatsApp Bot

```bash
cd bot
npm install
node bot.js       # scan the QR code on first run
```

`.env` options: `DEALS_URL`, `SITE_BASE`, `SCAN_INTERVAL_MIN`, `MAX_DEALS_PER_RUN`,
`WHATSAPP_GROUPS` (comma-separated group-name substrings), `GROUP_LINK` (invite link).

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
