# ⚡ DealsPulse — Affiliate Deals Website + Bot

Automatically finds Amazon deals and posts them to your website and WhatsApp groups.

-----

## How It Works

```
Bot (runs on your PC/server)
  │
  ├─ Scrapes Amazon deals every 30 min
  ├─ Writes public/deals.json
  ├─ Git commits + pushes to GitHub
  │
  └─ Vercel detects push → auto-redeploys website ✅
       └─ Website fetches /deals.json and shows live deals

  └─ Twilio sends top 3 deals to your WhatsApp numbers ✅
```

-----

## Project Structure

```
dealspulse/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── public/
│   └── deals.json        ← bot writes here; website reads this
├── src/
│   ├── main.jsx
│   └── App.jsx           ← the website
└── bot/
    ├── bot.py            ← the deal bot
    └── .env.example      ← copy to .env and fill in
```

-----

## Setup (Step by Step)

### 1. Deploy the Website to Vercel

```bash
# Install dependencies
npm install

# Push this whole folder to a new GitHub repo
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/dealspulse.git
git push -u origin main
```

Then go to [vercel.com](https://vercel.com):

- Click **Add New Project**
- Import your GitHub repo
- Vercel auto-detects Vite — just click **Deploy**
- Your site is live! 🎉

-----

### 2. Configure the Bot

```bash
cd bot
pip install requests beautifulsoup4 schedule python-dotenv twilio gitpython

cp .env.example .env
# Edit .env with your values
```

**Give the bot push access to GitHub:**

Option A — HTTPS with token:

```bash
git remote set-url origin https://YOUR_TOKEN@github.com/YOUR_USERNAME/dealspulse.git
```

Option B — SSH key (recommended): set up SSH and use `git@github.com:...` remote URL.

-----

### 3. Run the Bot

```bash
cd bot
python bot.py
```

The bot will:

1. Scan Amazon for deals
1. Write `public/deals.json`
1. Git push → Vercel redeploys the website automatically
1. Send top 3 deals to your WhatsApp numbers

-----

### 4. (Optional) WhatsApp via Twilio

1. Sign up at [twilio.com](https://twilio.com)
1. Activate the WhatsApp Sandbox: Console → Messaging → Try WhatsApp
1. Add your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and phone numbers to `.env`

-----

### 5. Update the WhatsApp Join Link

In `src/App.jsx`, find:

```
href="https://wa.me/yourphonenumber"
```

Replace with your actual WhatsApp group invite link.

-----

### 6. Add Your Affiliate Tag

In `.env`:

```
AMAZON_AFFILIATE_TAG=youraffid-20
```

Sign up for Amazon Associates at [affiliate-program.amazon.com](https://affiliate-program.amazon.com)

-----

## Tips

- **Amazon blocks scrapers** — for a reliable production setup, use [Amazon PA-API 5.0](https://webservices.amazon.com/paapi5/documentation/) (free with your affiliate account)
- Run the bot on a cheap VPS (e.g. DigitalOcean $4/mo, Hetzner €4/mo) so it runs 24/7
- Set `MIN_DISCOUNT_PCT=30` for higher-quality deals
- The website shows sample deals until the bot runs for the first time