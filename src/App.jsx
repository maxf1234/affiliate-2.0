import { useState, useEffect, useMemo } from "react";

// ── SITE CONFIG ───────────────────────────────────────────────────────────────
const WHATSAPP_LINK = "https://chat.whatsapp.com/LwxD0Pm4guRHt1n1YH8Wgx";
const SITE_NAME = "DealsPulse";

// Site buttons link straight to Amazon with the affiliate tag.
// Click tracking (/api/go) is only used for links sent to WhatsApp,
// plus the Prime Student referral (tracked under id "prime").
const PRIME_GO = (src) => `/api/go?id=prime&src=${src}`;

const FALLBACK_DEALS = [
  {
    id: "demo1",
    title: "Sony WH-1000XM5 Noise Cancelling Headphones",
    category: "Electronics",
    originalPrice: 399.99,
    dealPrice: 249.99,
    discount: 38,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
    affiliate_url: "https://amazon.com/?tag=youraffid-20",
    store: "Amazon",
    expires: null,
    hot: true,
    posted_at: new Date().toISOString(),
  },
];

// ── STYLES ────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --navy: #141b34;
    --navy-2: #1e2947;
    --orange: #ff9900;
    --orange-dark: #e68a00;
    --green: #1e9e50;
    --red: #e5484d;
    --bg: #f4f5f9;
    --card: #ffffff;
    --text: #1a2036;
    --muted: #6b7280;
    --line: #e7e9f0;
  }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .dp-root {
    min-height: 100vh; background: var(--bg); color: var(--text);
    font-family: "DM Sans", "Segoe UI", system-ui, sans-serif;
  }
  .dp-container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

  /* Header */
  .dp-header {
    background: var(--navy); position: sticky; top: 0; z-index: 100;
    box-shadow: 0 2px 12px rgba(10,14,30,0.25);
  }
  .dp-header-inner {
    max-width: 1200px; margin: 0 auto; padding: 0 20px;
    display: flex; align-items: center; gap: 14px; height: 62px;
  }
  .dp-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; cursor: pointer; }
  .dp-logo-mark {
    width: 34px; height: 34px; background: var(--orange); border-radius: 9px;
    display: flex; align-items: center; justify-content: center; font-size: 19px;
    box-shadow: 0 2px 8px rgba(255,153,0,0.4);
  }
  .dp-logo-name { font-weight: 800; font-size: 18px; color: #fff; line-height: 1.1; }
  .dp-logo-tag { font-size: 9.5px; color: #8d97b8; letter-spacing: 0.09em; text-transform: uppercase; }
  .dp-search {
    flex: 1; max-width: 420px; border: 1.5px solid var(--navy-2); border-radius: 10px;
    padding: 9px 14px; font-size: 14px; outline: none; background: var(--navy-2);
    color: #fff; transition: border-color 0.15s;
  }
  .dp-search::placeholder { color: #8d97b8; }
  .dp-search:focus { border-color: var(--orange); }
  .dp-sort {
    border: 1.5px solid var(--navy-2); border-radius: 9px; padding: 8px 10px;
    font-size: 13px; background: var(--navy-2); color: #fff; cursor: pointer; outline: none;
  }

  /* Hero */
  .dp-hero {
    background: linear-gradient(140deg, #141b34 0%, #1b2547 55%, #14355c 100%);
    color: #fff; padding: 36px 20px 30px; text-align: center;
  }
  .dp-hero-kicker {
    display: inline-flex; align-items: center; gap: 7px;
    font-size: 12px; color: var(--orange); font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px;
  }
  .dp-live-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #2ee66b;
    animation: dp-pulse 1.6s infinite;
  }
  @keyframes dp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
  .dp-hero h1 { margin: 0 0 8px; font-size: 34px; font-weight: 800; line-height: 1.15; }
  .dp-hero p { margin: 0 auto; max-width: 520px; color: #aab4d4; font-size: 14.5px; line-height: 1.55; }
  .dp-hero-stats {
    display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 18px;
  }
  .dp-stat-chip {
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.13);
    border-radius: 999px; padding: 7px 15px; font-size: 12.5px; color: #dfe4f2; font-weight: 600;
  }
  .dp-stat-chip strong { color: var(--orange); }

  /* Category bar */
  .dp-catbar { background: var(--card); border-bottom: 1px solid var(--line); }
  .dp-catbar-inner {
    max-width: 1200px; margin: 0 auto; padding: 10px 20px;
    display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
  }
  .dp-catbar-inner::-webkit-scrollbar { display: none; }
  .dp-cat {
    border: 1px solid var(--line); border-radius: 999px; padding: 7px 15px;
    font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;
    background: transparent; color: var(--muted); transition: all 0.15s;
    font-family: inherit;
  }
  .dp-cat:hover { border-color: var(--navy); color: var(--navy); }
  .dp-cat.active { background: var(--navy); border-color: var(--navy); color: #fff; }
  .dp-cat .count { opacity: 0.65; font-weight: 500; margin-left: 4px; }

  /* Grid */
  .dp-main { max-width: 1200px; margin: 0 auto; padding: 26px 20px 40px; }
  .dp-grid-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 16px; gap: 10px; flex-wrap: wrap; }
  .dp-grid-head h2 { margin: 0; font-size: 19px; font-weight: 800; }
  .dp-updated { font-size: 12.5px; color: var(--muted); }
  .dp-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 18px;
  }

  /* Card */
  .dp-card {
    background: var(--card); border-radius: 16px; overflow: hidden;
    box-shadow: 0 1px 4px rgba(16,24,52,0.07); display: flex; flex-direction: column;
    cursor: pointer; transition: transform 0.16s ease, box-shadow 0.16s ease;
    border: 1px solid var(--line);
  }
  .dp-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(16,24,52,0.14); }
  .dp-card-imgwrap { position: relative; background: #fff; height: 190px; display: flex; align-items: center; justify-content: center; padding: 14px; border-bottom: 1px solid var(--line); }
  .dp-card-imgwrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .dp-badges { position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; }
  .dp-badge {
    color: #fff; font-size: 10.5px; font-weight: 800; letter-spacing: 0.05em;
    padding: 4px 9px; border-radius: 6px; text-transform: uppercase;
  }
  .dp-badge.pct { background: var(--green); }
  .dp-badge.hot { background: var(--red); }
  .dp-badge.soon { background: #f57c00; position: absolute; top: 10px; right: 10px; }
  .dp-card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 7px; flex: 1; }
  .dp-card-cat { font-size: 10.5px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
  .dp-card-title {
    margin: 0; font-size: 14.5px; font-weight: 600; line-height: 1.4; color: var(--text);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    min-height: 2.8em;
  }
  .dp-price-row { display: flex; align-items: baseline; gap: 8px; }
  .dp-price { font-size: 23px; font-weight: 800; color: var(--text); }
  .dp-price-was { font-size: 13.5px; color: #9aa1b3; text-decoration: line-through; }
  .dp-save { margin: 0; font-size: 12.5px; color: var(--green); font-weight: 700; }
  .dp-expiry { font-size: 12px; color: var(--muted); }
  .dp-expiry.urgent { color: var(--red); font-weight: 700; }
  .dp-card-cta {
    margin-top: auto; padding-top: 10px; display: block;
    background: var(--orange); color: #17181c; text-decoration: none;
    border-radius: 10px; padding: 12px; font-weight: 800; font-size: 14px;
    text-align: center; transition: background 0.15s;
  }
  .dp-card-cta:hover { background: var(--orange-dark); }

  /* Skeletons */
  .dp-skel { border-radius: 16px; background: var(--card); border: 1px solid var(--line); overflow: hidden; }
  .dp-skel .s-img { height: 190px; }
  .dp-skel .s-line { height: 13px; border-radius: 6px; margin: 12px 16px 0; }
  .dp-skel .s-line.short { width: 45%; }
  .dp-skel .s-btn { height: 42px; border-radius: 10px; margin: 14px 16px 16px; }
  .dp-shimmer {
    background: linear-gradient(90deg, #eef0f5 25%, #f7f8fb 50%, #eef0f5 75%);
    background-size: 400% 100%; animation: dp-shimmer 1.4s infinite;
  }
  @keyframes dp-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

  /* WhatsApp CTA */
  .dp-wa-banner {
    background: linear-gradient(135deg, #10331f, #14532d); color: #fff;
    border-radius: 20px; padding: 34px 28px; text-align: center; margin: 36px auto 0;
  }
  .dp-wa-banner h2 { margin: 0 0 8px; font-size: 23px; font-weight: 800; }
  .dp-wa-banner p { margin: 0 0 18px; color: #b9e4c9; font-size: 14px; }
  .dp-wa-btn {
    display: inline-flex; align-items: center; gap: 9px; background: #25d366; color: #073317;
    text-decoration: none; padding: 13px 26px; border-radius: 12px; font-weight: 800; font-size: 15px;
    transition: transform 0.15s;
  }
  .dp-wa-btn:hover { transform: scale(1.03); }
  .dp-wa-float {
    position: fixed; bottom: 18px; right: 18px; z-index: 90;
    width: 54px; height: 54px; border-radius: 50%; background: #25d366;
    display: flex; align-items: center; justify-content: center; font-size: 27px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.28); text-decoration: none;
  }

  /* Footer */
  .dp-footer { background: var(--navy); color: #8d97b8; padding: 30px 20px 26px; text-align: center; font-size: 12.5px; line-height: 1.7; }
  .dp-footer a { color: #b9c2dd; }
  .dp-disclosure { max-width: 640px; margin: 0 auto 8px; }

  /* Deal page */
  .dp-deal-main { max-width: 960px; margin: 0 auto; padding: 26px 20px 60px; }
  .dp-back {
    background: none; border: none; cursor: pointer; font-size: 14px; font-weight: 700;
    color: var(--muted); display: inline-flex; align-items: center; gap: 6px; padding: 0;
    margin-bottom: 16px; font-family: inherit;
  }
  .dp-back:hover { color: var(--navy); }
  .dp-deal-card {
    background: var(--card); border-radius: 20px; overflow: hidden;
    box-shadow: 0 2px 20px rgba(16,24,52,0.09); border: 1px solid var(--line);
  }
  .dp-deal-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .dp-deal-image {
    background: #fff; display: flex; align-items: center; justify-content: center;
    padding: 36px; min-height: 360px; border-right: 1px solid var(--line);
  }
  .dp-deal-image img { max-width: 100%; max-height: 320px; object-fit: contain; }
  .dp-deal-info { padding: 32px; }
  .dp-deal-info h1 { margin: 0 0 16px; font-size: 22px; font-weight: 800; line-height: 1.35; }
  .dp-deal-pricebox { background: #f7f8fb; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
  .dp-deal-price { font-size: 34px; font-weight: 800; }
  .dp-cta {
    display: block; background: var(--orange); color: #17181c; text-decoration: none;
    border-radius: 12px; padding: 16px; font-weight: 800; font-size: 16.5px;
    text-align: center; transition: background 0.15s; margin-bottom: 10px;
  }
  .dp-cta:hover { background: var(--orange-dark); }
  .dp-cta-sub { text-align: center; font-size: 11.5px; color: var(--muted); margin: 0 0 16px; }
  .dp-prime-cta {
    display: block; background: #2662d9; color: #fff; text-decoration: none;
    border-radius: 12px; padding: 13px 14px; font-weight: 700; font-size: 14px;
    text-align: center; margin-bottom: 16px; transition: background 0.15s;
    line-height: 1.4;
  }
  .dp-prime-cta:hover { background: #1e51b8; }
  .dp-prime-cta .sub { display: block; font-size: 11.5px; font-weight: 500; opacity: 0.85; }
  .dp-perk-list { list-style: none; margin: 0 0 16px; padding: 0; }
  .dp-perk-list li { padding: 5px 0; font-size: 14px; color: var(--text); }
  .dp-perk-list li::before { content: "✅ "; }
  .dp-share-row { display: flex; gap: 10px; }
  .dp-share-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
    border-radius: 11px; padding: 12px; font-weight: 700; font-size: 13.5px;
    cursor: pointer; text-decoration: none; text-align: center; font-family: inherit;
  }
  .dp-share-btn.wa { background: #25d366; color: #073317; border: none; }
  .dp-share-btn.copy { background: #fff; color: var(--text); border: 1.5px solid var(--line); }
  .dp-share-btn.copy:hover { border-color: var(--navy); }
  .dp-related-title { margin: 34px 0 14px; font-size: 18px; font-weight: 800; }

  /* Empty state */
  .dp-empty { text-align: center; padding: 70px 20px; color: var(--muted); }
  .dp-empty .icon { font-size: 44px; margin-bottom: 10px; }
  .dp-empty button {
    margin-top: 14px; padding: 10px 22px; background: var(--navy); color: #fff;
    border: none; border-radius: 9px; cursor: pointer; font-size: 14px; font-weight: 700;
    font-family: inherit;
  }

  @media (max-width: 720px) {
    .dp-header-inner { flex-wrap: wrap; height: auto; padding: 10px 14px; row-gap: 9px; }
    .dp-search { order: 3; flex-basis: 100%; max-width: 100%; }
    .dp-hero { padding: 26px 16px 24px; }
    .dp-hero h1 { font-size: 25px; }
    .dp-main { padding: 18px 12px 40px; }
    .dp-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .dp-card-imgwrap { height: 145px; }
    .dp-price { font-size: 19px; }
    .dp-card-title { font-size: 13px; }
    .dp-deal-grid { grid-template-columns: 1fr; }
    .dp-deal-image { min-height: 240px; padding: 20px; border-right: none; border-bottom: 1px solid var(--line); }
    .dp-deal-info { padding: 20px; }
    .dp-deal-info h1 { font-size: 18px; }
    .dp-deal-price { font-size: 28px; }
    .dp-wa-banner { border-radius: 16px; padding: 26px 18px; }
  }
`;

// ── HELPERS ───────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];

function daysLeftOf(deal) {
  if (!deal.expires) return null;
  return Math.max(0, Math.ceil((new Date(deal.expires + "T23:59:59") - new Date()) / 86400000));
}

function expiryLabel(deal) {
  const d = daysLeftOf(deal);
  if (d === null) return null;
  if (d <= 0) return { text: "Ends today!", urgent: true };
  if (d === 1) return { text: "Ends tomorrow", urgent: true };
  return { text: `Ends in ${d} days`, urgent: false };
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

const Badge = ({ cls, children }) => <span className={`dp-badge ${cls}`}>{children}</span>;

// ── DEAL CARD ─────────────────────────────────────────────────────────────────
function DealCard({ deal, onView }) {
  const savings = deal.originalPrice > deal.dealPrice && deal.dealPrice > 0
    ? (deal.originalPrice - deal.dealPrice).toFixed(2) : null;
  const exp = expiryLabel(deal);

  return (
    <div className="dp-card" onClick={() => onView(deal.id)}>
      <div className="dp-card-imgwrap">
        <img src={deal.image} alt={deal.title} loading="lazy" />
        <div className="dp-badges">
          {deal.discount > 0 && <Badge cls="pct">-{deal.discount}%</Badge>}
          {deal.hot && <Badge cls="hot">🔥 Hot</Badge>}
        </div>
        {exp && exp.urgent && <Badge cls="soon">{exp.text}</Badge>}
      </div>
      <div className="dp-card-body">
        <span className="dp-card-cat">{deal.category}</span>
        <h3 className="dp-card-title">{deal.title}</h3>
        <div className="dp-price-row">
          <span className="dp-price">{deal.dealPrice > 0 ? `$${deal.dealPrice.toFixed(2)}` : "See Price"}</span>
          {deal.originalPrice > 0 && <span className="dp-price-was">${deal.originalPrice.toFixed(2)}</span>}
        </div>
        {savings && <p className="dp-save">You save ${savings}</p>}
        {exp && !exp.urgent && <span className="dp-expiry">{exp.text}</span>}
        <a
          className="dp-card-cta"
          href={deal.affiliate_url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={e => e.stopPropagation()}
        >
          Get Deal →
        </a>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="dp-skel">
      <div className="s-img dp-shimmer" />
      <div className="s-line dp-shimmer" />
      <div className="s-line short dp-shimmer" />
      <div className="s-btn dp-shimmer" />
    </div>
  );
}

// ── SINGLE DEAL PAGE ──────────────────────────────────────────────────────────
function DealPage({ deals, id, src, onBack, onView }) {
  const deal = deals.find(d => d.id === id);
  const [copied, setCopied] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  if (!deal) return (
    <div className="dp-empty" style={{ paddingTop: 100 }}>
      <div className="icon">🔍</div>
      <p>This deal has expired or been removed.</p>
      <button onClick={onBack}>See Today's Deals</button>
    </div>
  );

  const savings = deal.originalPrice > deal.dealPrice && deal.dealPrice > 0
    ? (deal.originalPrice - deal.dealPrice).toFixed(2) : null;
  const exp = expiryLabel(deal);
  const shareUrl = window.location.origin + "/share/deal/" + encodeURIComponent(deal.id);

  const related = deals
    .filter(d => d.id !== deal.id)
    .sort((a, b) => (b.category === deal.category) - (a.category === deal.category) || b.discount - a.discount)
    .slice(0, 4);

  const handleCopy = () => {
    copyText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <main className="dp-deal-main">
      <button className="dp-back" onClick={onBack}>← All deals</button>

      <div className="dp-deal-card">
        <div className="dp-deal-grid">
          <div className="dp-deal-image">
            <img src={deal.image} alt={deal.title} />
          </div>
          <div className="dp-deal-info">
            <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
              {deal.hot && <Badge cls="hot">🔥 Hot Deal</Badge>}
              {deal.discount > 0 && <Badge cls="pct">-{deal.discount}% OFF</Badge>}
              <span className="dp-card-cat" style={{ alignSelf: "center" }}>{deal.category}</span>
            </div>

            <h1>{deal.title}</h1>

            <div className="dp-deal-pricebox">
              <div className="dp-price-row">
                <span className="dp-deal-price">{deal.dealPrice > 0 ? `$${deal.dealPrice.toFixed(2)}` : "See Price"}</span>
                {deal.originalPrice > 0 && <span className="dp-price-was" style={{ fontSize: 16 }}>${deal.originalPrice.toFixed(2)}</span>}
              </div>
              {savings && <p className="dp-save" style={{ fontSize: 14, margin: "6px 0 0" }}>You save ${savings}!</p>}
              {exp && (
                <div className={`dp-expiry ${exp.urgent ? "urgent" : ""}`} style={{ marginTop: 6 }}>
                  ⏳ {exp.text}
                </div>
              )}
            </div>

            <a
              className="dp-cta"
              href={deal.affiliate_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              Get Deal on Amazon →
            </a>
            <p className="dp-cta-sub">Price checked recently — may change on Amazon at any time.</p>

            <a
              className="dp-prime-cta"
              href={PRIME_GO("deal")}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              🎓 18–24? Get 6 months of Amazon Prime FREE →
              <span className="sub">Free shipping on this deal + 5% cash back</span>
            </a>

            <div className="dp-share-row">
              <a
                className="dp-share-btn wa"
                href={"https://wa.me/?text=" + encodeURIComponent(`🔥 ${deal.title} — $${deal.dealPrice.toFixed(2)}${savings ? ` (save $${savings})` : ""}\n${shareUrl}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 Share
              </a>
              <button className="dp-share-btn copy" onClick={handleCopy}>
                {copied ? "✓ Copied!" : "📋 Copy link"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <>
          <h2 className="dp-related-title">You might also like</h2>
          <div className="dp-grid">
            {related.map(d => <DealCard key={d.id} deal={d} onView={onView} />)}
          </div>
        </>
      )}
    </main>
  );
}

// ── PRIME REFERRAL PAGE (/prime) ─────────────────────────────────────────────
function PrimePage({ onBack }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const shareUrl = window.location.origin + "/prime";
  const shareText = "🚨 JUST IN TIME! 6 months of Amazon Prime — completely FREE if you're 18–24 🎓 Free fast shipping, Prime Video + 5% cash back. Claim it here: " + shareUrl;

  const handleCopy = () => {
    copyText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <main className="dp-deal-main">
      <button className="dp-back" onClick={onBack}>← All deals</button>

      <div className="dp-deal-card">
        <div className="dp-deal-grid">
          <div className="dp-deal-image" style={{ background: "#3272e0", padding: 24 }}>
            <img src="/prime-student.webp" alt="Amazon Prime — 6-month free trial for 18-24 year-olds and students" />
          </div>
          <div className="dp-deal-info">
            <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
              <Badge cls="hot">🚨 Just In</Badge>
              <Badge cls="pct">100% FREE</Badge>
              <span className="dp-card-cat" style={{ alignSelf: "center" }}>Ages 18–24 & Students</span>
            </div>

            <h1>6 Months of Amazon Prime — Totally FREE 🎉</h1>

            <div className="dp-deal-pricebox">
              <div className="dp-price-row">
                <span className="dp-deal-price">$0.00</span>
                <span className="dp-price-was" style={{ fontSize: 16 }}>$7.49/mo</span>
              </div>
              <p className="dp-save" style={{ fontSize: 14, margin: "6px 0 0" }}>Half a year of Prime, on the house — cancel anytime.</p>
            </div>

            <ul className="dp-perk-list">
              <li>FREE fast delivery on millions of items</li>
              <li>Prime Video — movies, shows & live sports</li>
              <li>5% cash back on eligible categories</li>
              <li>Prime-exclusive deals before everyone else</li>
            </ul>

            <a
              className="dp-cta"
              href={PRIME_GO("share")}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              🎓 Claim Your Free 6 Months →
            </a>
            <p className="dp-cta-sub">For 18–24 year-olds & students. No payment needed today — Amazon terms apply.</p>

            <div className="dp-share-row">
              <a
                className="dp-share-btn wa"
                href={"https://wa.me/?text=" + encodeURIComponent(shareText)}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 Share
              </a>
              <button className="dp-share-btn copy" onClick={handleCopy}>
                {copied ? "✓ Copied!" : "📋 Copy link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [route, setRoute] = useState({ dealId: null, src: null });

  // Hash routing: #/deal/<id>?src=<channel>
  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/deal/")) {
        const [idPart, query] = hash.replace("#/deal/", "").split("?");
        const params = new URLSearchParams(query || "");
        setRoute({ dealId: decodeURIComponent(idPart), src: params.get("src"), prime: false });
      } else if (hash.startsWith("#/prime")) {
        setRoute({ dealId: null, src: null, prime: true });
      } else {
        setRoute({ dealId: null, src: null, prime: false });
      }
    };
    checkRoute();
    window.addEventListener("hashchange", checkRoute);
    return () => window.removeEventListener("hashchange", checkRoute);
  }, []);

  const navigateToDeal = (id) => { window.location.hash = "/deal/" + encodeURIComponent(id); };
  const navigateHome = () => { window.location.hash = ""; };

  useEffect(() => {
    fetch("/deals.json?t=" + Date.now())
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const today = todayStr();
          const live = data.filter(d => !d.expires || d.expires >= today);
          setDeals(live.length ? live : FALLBACK_DEALS);
          if (live.length) {
            const latest = live.reduce((a, b) => new Date(a.posted_at) > new Date(b.posted_at) ? a : b);
            setLastUpdated(new Date(latest.posted_at));
          }
        } else {
          setDeals(FALLBACK_DEALS);
        }
      })
      .catch(() => setDeals(FALLBACK_DEALS))
      .finally(() => setLoading(false));
  }, []);

  // Categories built from live data, biggest first
  const categories = useMemo(() => {
    const counts = {};
    deals.forEach(d => { counts[d.category] = (counts[d.category] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return [["All", deals.length], ...sorted];
  }, [deals]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deals
      .filter(d => activeCategory === "All" || d.category === activeCategory)
      .filter(d => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortBy === "newest") return new Date(b.posted_at) - new Date(a.posted_at);
        if (sortBy === "hot") return (b.hot ? 1 : 0) - (a.hot ? 1 : 0) || b.discount - a.discount;
        if (sortBy === "discount") return b.discount - a.discount;
        if (sortBy === "price_low") return a.dealPrice - b.dealPrice;
        if (sortBy === "price_high") return b.dealPrice - a.dealPrice;
        return 0;
      });
  }, [deals, activeCategory, searchQuery, sortBy]);

  const hotCount = deals.filter(d => d.hot).length;

  const header = (
    <header className="dp-header">
      <div className="dp-header-inner">
        <a className="dp-logo" onClick={navigateHome}>
          <div className="dp-logo-mark">⚡</div>
          <div>
            <div className="dp-logo-name">{SITE_NAME}</div>
            <div className="dp-logo-tag">Best Amazon Deals</div>
          </div>
        </a>
        {!route.dealId && !route.prime && (
          <>
            <input
              className="dp-search"
              type="search"
              placeholder="Search deals…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <select className="dp-sort" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="hot">Hottest</option>
              <option value="discount">Biggest Discount</option>
              <option value="price_low">Price: Low → High</option>
              <option value="price_high">Price: High → Low</option>
            </select>
          </>
        )}
      </div>
    </header>
  );

  const footer = (
    <footer className="dp-footer">
      <p className="dp-disclosure">
        <strong>Affiliate disclosure:</strong> As an Amazon Associate, {SITE_NAME} earns from
        qualifying purchases. Prices and availability were accurate at posting time but can
        change at any moment — always confirm the final price on Amazon.
      </p>
      <p>© {new Date().getFullYear()} {SITE_NAME} · <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">Get deals on WhatsApp</a></p>
    </footer>
  );

  return (
    <div className="dp-root">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      {header}

      {route.prime ? (
        <PrimePage onBack={navigateHome} />
      ) : route.dealId ? (
        <DealPage deals={deals} id={route.dealId} src={route.src} onBack={navigateHome} onView={navigateToDeal} />
      ) : (
        <>
          <div className="dp-hero">
            <div className="dp-hero-kicker"><span className="dp-live-dot" /> Live · auto-updated hourly</div>
            <h1>Today's Best Amazon Deals</h1>
            <p>Hand-checked discounts of 25% or more, refreshed every hour. Deals expire fast — grab them while they last.</p>
            <div className="dp-hero-stats">
              <span className="dp-stat-chip"><strong>{deals.length}</strong> live deals</span>
              <span className="dp-stat-chip"><strong>{hotCount}</strong> 🔥 hot right now</span>
              {lastUpdated && <span className="dp-stat-chip">Updated <strong>{lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></span>}
            </div>
          </div>

          <div className="dp-catbar">
            <div className="dp-catbar-inner">
              {categories.map(([cat, count]) => (
                <button
                  key={cat}
                  className={`dp-cat ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}<span className="count">{count}</span>
                </button>
              ))}
            </div>
          </div>

          <main className="dp-main">
            {loading ? (
              <div className="dp-grid">
                {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="dp-empty">
                <div className="icon">🔍</div>
                <p>No deals match your search.</p>
                <button onClick={() => { setSearchQuery(""); setActiveCategory("All"); }}>Clear filters</button>
              </div>
            ) : (
              <>
                <div className="dp-grid-head">
                  <h2>{activeCategory === "All" ? "All Deals" : activeCategory} ({filtered.length})</h2>
                  {lastUpdated && <span className="dp-updated">Last updated {lastUpdated.toLocaleString()}</span>}
                </div>
                <div className="dp-grid">
                  {filtered.map(deal => <DealCard key={deal.id} deal={deal} onView={navigateToDeal} />)}
                </div>
              </>
            )}

            <div className="dp-wa-banner">
              <div style={{ fontSize: 34, marginBottom: 8 }}>💬</div>
              <h2>Never miss a deal again</h2>
              <p>Join our free WhatsApp group — the hottest deals land there the moment our bot finds them.</p>
              <a className="dp-wa-btn" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                Join the WhatsApp Group →
              </a>
            </div>
          </main>
        </>
      )}

      {footer}

      <a className="dp-wa-float" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" aria-label="Join our WhatsApp group">💬</a>
    </div>
  );
}
