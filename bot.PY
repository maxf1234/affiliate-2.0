# “””
DealsPulse Bot

Scrapes Amazon deals, writes to public/deals.json, then
git-commits & pushes so Vercel auto-redeploys the website.

SETUP:
pip install requests beautifulsoup4 schedule python-dotenv twilio gitpython

CONFIGURE:
Copy .env.example → .env and fill in your values.
Run once: python bot.py
“””

import os, json, time, random, logging, schedule
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format=”%(asctime)s [%(levelname)s] %(message)s”)
log = logging.getLogger(“DealsPulse”)

# ── CONFIG ────────────────────────────────────────────────────────────────────

AFFILIATE_TAG     = os.getenv(“AMAZON_AFFILIATE_TAG”, “youraffid-20”)
WHATSAPP_NUMBERS  = [n.strip() for n in os.getenv(“WHATSAPP_NUMBERS”, “”).split(”,”) if n.strip()]
TWILIO_SID        = os.getenv(“TWILIO_ACCOUNT_SID”, “”)
TWILIO_TOKEN      = os.getenv(“TWILIO_AUTH_TOKEN”, “”)
TWILIO_FROM       = os.getenv(“TWILIO_WHATSAPP_FROM”, “whatsapp:+14155238886”)
REPO_PATH         = os.getenv(“REPO_PATH”, “.”)           # path to your cloned GitHub repo
DEALS_JSON_PATH   = os.path.join(REPO_PATH, “public”, “deals.json”)
MIN_DISCOUNT_PCT  = int(os.getenv(“MIN_DISCOUNT_PCT”, “20”))
MAX_DEALS_PER_RUN = int(os.getenv(“MAX_DEALS_PER_RUN”, “10”))
SCAN_INTERVAL_MIN = int(os.getenv(“SCAN_INTERVAL_MIN”, “30”))
GITHUB_ENABLED    = os.getenv(“GITHUB_PUSH”, “true”).lower() == “true”

# ── DATA MODEL ────────────────────────────────────────────────────────────────

@dataclass
class Deal:
id: str
title: str
category: str
originalPrice: float
dealPrice: float
discount: int
image: str
affiliate_url: str
store: str = “Amazon”
expires: str = “”
hot: bool = False
posted_at: str = “”

```
def __post_init__(self):
    if not self.posted_at:
        self.posted_at = datetime.utcnow().isoformat()
    if not self.expires:
        self.expires = (datetime.utcnow() + timedelta(days=2)).strftime("%Y-%m-%d")
```

# ── SCRAPER ───────────────────────────────────────────────────────────────────

class AmazonScraper:
“””
Scrapes Amazon Gold Box / Lightning Deals.

```
⚠️  For production, use Amazon PA-API 5.0 instead — it's free with your
    affiliate account and gives structured data without scraping risk.
    https://webservices.amazon.com/paapi5/documentation/
"""
HEADERS_POOL = [
    {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"},
    {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15", "Accept-Language": "en-GB,en;q=0.9"},
]

def __init__(self):
    self.session = requests.Session()
    self.session.headers.update(random.choice(self.HEADERS_POOL))
    self._seen: set = set()

def _get(self, url):
    try:
        time.sleep(random.uniform(2, 5))
        r = self.session.get(url, timeout=15)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        log.warning(f"Request failed: {e}")
        return None

def _price(self, text):
    try:
        return float(text.replace("$", "").replace(",", "").strip())
    except Exception:
        return None

def scrape(self) -> list:
    deals = []
    soup = self._get("https://www.amazon.com/gp/goldbox")
    if not soup:
        return deals

    cards = soup.select("div[data-asin]") or soup.select(".DealContent")
    log.info(f"Found {len(cards)} candidate cards")

    for card in cards[:MAX_DEALS_PER_RUN * 3]:
        try:
            asin = card.get("data-asin", "")
            if not asin or asin in self._seen:
                continue

            title_el = card.select_one("a[aria-label], .a-size-base-plus, h2 a")
            if not title_el:
                continue
            title = title_el.get_text(strip=True)

            price_el = card.select_one(".a-price .a-offscreen, .dealPriceText")
            orig_el  = card.select_one(".a-text-price .a-offscreen, .originalPriceText")
            deal_price = self._price(price_el.get_text()) if price_el else None
            orig_price = self._price(orig_el.get_text()) if orig_el else None

            if not deal_price or not orig_price or orig_price <= deal_price:
                continue
            discount = int((1 - deal_price / orig_price) * 100)
            if discount < MIN_DISCOUNT_PCT:
                continue

            img_el   = card.select_one("img")
            cat_el   = card.select_one(".a-color-secondary")
            deal = Deal(
                id=asin, title=title[:120],
                category=cat_el.get_text(strip=True) if cat_el else "General",
                originalPrice=orig_price, dealPrice=deal_price, discount=discount,
                image=img_el["src"] if img_el else "",
                affiliate_url=f"https://www.amazon.com/dp/{asin}?tag={AFFILIATE_TAG}",
                hot=discount >= 40,
            )
            deals.append(deal)
            self._seen.add(asin)
            if len(deals) >= MAX_DEALS_PER_RUN:
                break
        except Exception as e:
            log.debug(f"Card skip: {e}")

    log.info(f"Scraped {len(deals)} valid deals (≥{MIN_DISCOUNT_PCT}% off)")
    return deals
```

# ── GITHUB PUBLISHER ──────────────────────────────────────────────────────────

class GitHubPublisher:
“””
Writes deals.json to public/ then git commits + pushes.
Vercel detects the push and auto-redeploys the website.
Requires: git remote already configured with push access
(use a GitHub Personal Access Token in the remote URL or SSH key).
“””

```
def publish(self, deals: list) -> bool:
    try:
        existing = self._load()
        existing_ids = {d["id"] for d in existing}
        new_deals = [asdict(d) for d in deals if d.id not in existing_ids]

        if not new_deals:
            log.info("No new deals — skipping publish.")
            return False

        all_deals = (new_deals + existing)[:100]
        os.makedirs(os.path.dirname(DEALS_JSON_PATH), exist_ok=True)
        with open(DEALS_JSON_PATH, "w") as f:
            json.dump(all_deals, f, indent=2)
        log.info(f"Wrote {len(new_deals)} new deals → {DEALS_JSON_PATH}")

        if GITHUB_ENABLED:
            self._git_push(len(new_deals))
        return True

    except Exception as e:
        log.error(f"Publish failed: {e}")
        return False

def _load(self):
    try:
        with open(DEALS_JSON_PATH) as f:
            return json.load(f)
    except Exception:
        return []

def _git_push(self, count: int):
    try:
        from git import Repo
        repo = Repo(REPO_PATH)
        repo.index.add(["public/deals.json"])
        repo.index.commit(f"bot: add {count} new deals [{datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC]")
        origin = repo.remote(name="origin")
        origin.push()
        log.info("✅ Pushed to GitHub — Vercel will redeploy automatically.")
    except Exception as e:
        log.error(f"Git push failed: {e}")
        log.info("Tip: make sure your remote uses a PAT token or SSH key with push access.")
```

# ── WHATSAPP SENDER ───────────────────────────────────────────────────────────

class WhatsAppSender:
“””
Sends deal alerts via Twilio WhatsApp API.
Sign up: https://console.twilio.com
Sandbox number: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
“””

```
def send(self, deals: list) -> int:
    if not TWILIO_SID or not TWILIO_TOKEN or not WHATSAPP_NUMBERS:
        log.warning("WhatsApp not configured — skipping.")
        return 0
    sent = 0
    for deal in deals:
        msg = self._format(deal)
        for number in WHATSAPP_NUMBERS:
            if self._send_one(number, msg):
                sent += 1
            time.sleep(1)
    return sent

def _format(self, deal) -> str:
    savings = deal.originalPrice - deal.dealPrice
    return (
        f"🔥 *DealsPulse Alert!*\n\n"
        f"*{deal.title}*\n\n"
        f"💰 ~~${deal.originalPrice:.2f}~~ → *${deal.dealPrice:.2f}* ({deal.discount}% OFF)\n"
        f"💵 You save *${savings:.2f}*\n\n"
        f"🛒 {deal.affiliate_url}\n\n"
        f"⏰ Expires: {deal.expires}\n"
        f"_Via DealsPulse · Amazon Affiliate_"
    )

def _send_one(self, to: str, body: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        msg = client.messages.create(from_=TWILIO_FROM, body=body, to=to)
        log.info(f"WhatsApp sent → {to}: {msg.sid}")
        return True
    except Exception as e:
        log.error(f"WhatsApp failed → {to}: {e}")
        return False
```

# ── BOT ORCHESTRATOR ──────────────────────────────────────────────────────────

class DealsPulseBot:
def **init**(self):
self.scraper   = AmazonScraper()
self.publisher = GitHubPublisher()
self.whatsapp  = WhatsAppSender()

```
def run_once(self):
    log.info("=" * 55)
    log.info(f"🤖 Scanning at {datetime.now().strftime('%H:%M:%S')} ...")
    deals = self.scraper.scrape()
    if not deals:
        log.info("No qualifying deals this scan.")
        return
    published = self.publisher.publish(deals)
    if published:
        top3 = sorted(deals, key=lambda d: d.discount, reverse=True)[:3]
        sent = self.whatsapp.send(top3)
        log.info(f"Done: {len(deals)} deals saved · {sent} WhatsApp messages sent.")

def start(self):
    log.info(f"🚀 DealsPulse Bot — scanning every {SCAN_INTERVAL_MIN} min")
    self.run_once()
    schedule.every(SCAN_INTERVAL_MIN).minutes.do(self.run_once)
    while True:
        schedule.run_pending()
        time.sleep(30)
```

# ── ENTRY POINT ───────────────────────────────────────────────────────────────

if **name** == “**main**”:
DealsPulseBot().start()