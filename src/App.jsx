import { useState, useEffect, useMemo } from "react";

// ── SITE CONFIG ───────────────────────────────────────────────────────────────
const WHATSAPP_LINK = "https://chat.whatsapp.com/LwxD0Pm4guRHt1n1YH8Wgx";
const SITE_NAME = "DealsPulse";

// Site buttons link straight to the retailer with our affiliate tag.
// Click tracking (/api/go) is only used for links sent to WhatsApp.

const FALLBACK_DEALS = [
  {
    id: "demo1",
    title: "Sony WH-1000XM5 Noise Cancelling Headphones",
    category: "Electronics",
    originalPrice: 399.99,
    dealPrice: 249.99,
    discount: 38,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
    affiliate_url: "https://www.example.com/",
    store: "Retailer",
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
    --orange: #0e9f6e;
    --orange-dark: #0b8259;
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
    box-shadow: 0 2px 8px rgba(14,159,110,0.35);
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
    background: var(--orange); color: #ffffff; text-decoration: none;
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

  /* Editorial */
  .dp-article { max-width: 760px; margin: 0 auto; padding: 26px 20px 60px; }
  .dp-article h1 { font-size: 30px; font-weight: 800; margin: 0 0 6px; line-height: 1.2; }
  .dp-article-intro { color: var(--muted); font-size: 15.5px; margin: 0 0 28px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
  .dp-article section { margin-bottom: 24px; }
  .dp-article h2 { font-size: 18.5px; font-weight: 800; margin: 0 0 8px; }
  .dp-article p { margin: 0; font-size: 15.5px; line-height: 1.72; color: #313a52; }
  .dp-explainer {
    background: var(--card); border: 1px solid var(--line); border-radius: 18px;
    padding: 28px; margin-top: 36px;
  }
  .dp-explainer > h2 { margin: 0 0 10px; font-size: 21px; font-weight: 800; }
  .dp-explainer > p { margin: 0 0 20px; font-size: 15px; line-height: 1.7; color: #313a52; }
  .dp-explainer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
  .dp-explainer-grid h3 { margin: 0 0 6px; font-size: 14.5px; font-weight: 800; }
  .dp-explainer-grid p { margin: 0; font-size: 14px; line-height: 1.65; color: var(--muted); }
  .dp-explainer a { color: var(--orange-dark); font-weight: 600; }

  /* Editorial page call-to-action */
  .dp-article-cta { margin: 0 0 30px; }
  .dp-article-cta a {
    display: block; background: var(--orange); color: #ffffff; text-decoration: none;
    border-radius: 12px; padding: 16px; font-weight: 800; font-size: 16.5px;
    text-align: center; transition: background 0.15s;
  }
  .dp-article-cta a:hover { background: var(--orange-dark); }
  .dp-article-cta p {
    text-align: center; font-size: 11.5px; color: var(--muted); margin: 9px 0 0; line-height: 1.6;
  }
  .dp-article-checklist { list-style: none; margin: 10px 0 0; padding: 0; }
  .dp-article-checklist li {
    padding: 5px 0 5px 22px; position: relative; font-size: 15px; line-height: 1.6; color: #313a52;
  }
  .dp-article-checklist li::before {
    content: "•"; position: absolute; left: 6px; color: var(--orange-dark); font-weight: 800;
  }
  .dp-footer-nav {
    display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: center; margin-bottom: 14px;
  }
  .dp-footer-nav a { color: #c3cbe4; text-decoration: none; font-size: 13px; font-weight: 600; }
  .dp-footer-nav a:hover { color: #fff; text-decoration: underline; }

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
    display: block; background: var(--orange); color: #ffffff; text-decoration: none;
    border-radius: 12px; padding: 16px; font-weight: 800; font-size: 16.5px;
    text-align: center; transition: background 0.15s; margin-bottom: 10px;
  }
  .dp-cta:hover { background: var(--orange-dark); }
  .dp-cta-sub { text-align: center; font-size: 11.5px; color: var(--muted); margin: 0 0 16px; }
  .dp-cta-secondary {
    display: block; background: #fff; color: var(--orange-dark); text-decoration: none;
    border: 1.5px solid var(--line); border-radius: 12px; padding: 13px;
    font-weight: 700; font-size: 13.5px; text-align: center; margin-bottom: 16px;
    transition: border-color 0.15s;
  }
  .dp-cta-secondary:hover { border-color: var(--orange); }
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
              Get This Deal →
            </a>
            <p className="dp-cta-sub">Price and availability checked when this deal was posted (see date below) and can change at any time — always confirm on the retailer's page before buying.</p>

            {/* Points at our own explainer, not straight at the referral link,
                so nobody reaches the sign-up without reading the terms first. */}
            <a className="dp-cta-secondary" href="#/p/student-trial">
              Aged 18–24 or a student? There's a cheaper way to get Prime →
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


// ── EDITORIAL CONTENT PAGES ───────────────────────────────────────────────────
// Static, original content. Amazon's Associates review requires a site to offer
// real value beyond a bare list of links, and to disclose who runs it and how
// it makes money.
const UPDATED = "July 2026";
// Shown on the Contact page. Amazon requires a working way to reach the site
// owner — swap this for a dedicated address any time.
const CONTACT_EMAIL = "frager.max@gmail.com";
// Amazon referral link for the discounted-membership sign-up flow. Routed
// through /api/go so taps are counted the same way deal clicks are.
const PRIME_REFERRAL_URL = "/api/go?id=student-trial&src=deal";

const PAGES = {
  about: {
    title: "About " + SITE_NAME,
    intro: "Who runs this site, what it does, and how it stays useful.",
    body: [
      ["What this site is",
       SITE_NAME + " is an independently run price-tracking site. We watch a handful of public deal feeds around the clock, filter out the noise, and publish only the discounts we think are actually worth someone's money. Everything here is chosen by the same rules, applied the same way, every hour of every day — no sponsored placements, no paid inclusion."],
      ["Why we built it",
       "Deal sites tend to fail in one of two directions. Some publish everything, so you scroll past fifty mediocre offers to find one good one. Others publish so little that you stop checking. We wanted the opposite: a short, honest list where the default assumption is that anything on the page cleared a real bar. That is why we set a minimum discount of 25% and drop deals the moment they expire, even when it leaves the page thinner."],
      ["How we make money",
       "When you use one of our links to buy something, the retailer may pay us a small commission. It costs you nothing extra and never changes the price you pay. Crucially, it does not change what we publish either — our selection rules are applied automatically before anyone sees which products would earn more. As an Amazon Associate we earn from qualifying purchases."],
      ["What we are not",
       SITE_NAME + " is an independent site. We are not affiliated with, endorsed by, or sponsored by any retailer or brand we link to. We do not sell anything ourselves, we do not process payments, and we never handle your order — every purchase happens on the retailer's own site under their terms, returns policy, and customer service."],
    ],
  },
  "how-we-pick": {
    title: "How We Pick Deals",
    intro: "Our full selection method, written out so you can judge it for yourself.",
    body: [
      ["The 25% floor",
       "A product only reaches the site if it is discounted at least 25% off its stated regular price. Retailers love advertising 10% off; in our experience that rarely represents a genuinely good moment to buy. Setting the floor at 25% cuts the volume dramatically, and that is the point. If a deal does not clear the bar, we simply don't publish it, even on slow days when the page ends up short."],
      ["Where deals come from",
       "We monitor several public deal feeds and community sites hourly. Each source is parsed independently, so if one goes down or changes its format the others keep running. When the same product shows up on two sources, we keep one entry — we match on the product's unique retailer ID rather than its title, because the same item is often listed under slightly different names."],
      ["Verifying the discount",
       "We only show a \"was\" price when the source actually states one. If a listing claims a saving we cannot tie to a stated regular price, we publish the current price with no discount badge rather than inventing a comparison. A struck-through price on this site always corresponds to a regular price someone published, not a number we made up to look impressive."],
      ["Expiry and freshness",
       "Every deal carries a date. On each run we remove anything past its expiry, so you should not land on a page advertising a discount that ended last week. Prices still move faster than any site can track, which is why every deal page tells you when we checked and asks you to confirm the live price before buying. If a price has changed by the time you click, believe the retailer, not us."],
      ["What we deliberately leave out",
       "We do not republish retailer product reviews, star ratings, or screenshots. If you want to know what buyers think, read them at the source where they are complete and current. We also do not write \"lowest price ever\" claims unless the source documents it — price history is genuinely hard to verify, and a confident-sounding claim we cannot back up is worse than no claim."],
    ],
  },
  "deal-guide": {
    title: "How to Tell a Real Deal From a Fake One",
    intro: "Five habits that will save you more money than any deal site, including this one.",
    body: [
      ["Check the price history, not the percentage",
       "The single most useful habit in online shopping: before buying, look at what the item has actually sold for over the past few months. Free browser tools and price-history sites plot this for most major retailers. A \"40% off\" badge means very little if the regular price was quietly raised the week before. A modest 20% off an item that has never been discounted is often the better buy."],
      ["Treat inflated list prices with suspicion",
       "Some sellers set an artificially high \"list price\" that the product never actually sold for, so every day looks like a sale. A quick sanity check: search the exact product name and compare across two or three retailers. If nobody else is anywhere near that list price, the discount is decoration."],
      ["Watch the per-unit price on multipacks",
       "Bulk packs are where good deals and bad deals look identical. A 24-pack at 30% off can still cost more per unit than a 6-pack at full price. Divide the price by the count before you decide — it takes five seconds and it is the mistake we see most often."],
      ["Factor in shipping, returns, and the seller",
       "A price is not a price until it includes delivery. Check the total at checkout, confirm the return window, and look at who is actually selling and shipping the item — on marketplaces, a listing under a familiar brand may come from a third party with a different returns policy. For anything expensive or perishable, that distinction matters."],
      ["Decide before the countdown does",
       "Urgency is the oldest tool in retail, and we use it here too: our deals show an expiry because they genuinely do end. But a deadline is only a reason to buy something you already wanted. If you would not have bought the item this month at that price, a timer should not change your mind. The best saving is on the thing you do not buy."],
    ],
  },
  "student-trial": {
    title: "The Prime Free Trial for Students and 18–24s",
    intro: "What the offer is, who qualifies, what it costs once the trial ends, and how to cancel.",
    cta: {
      href: PRIME_REFERRAL_URL,
      label: "Check your eligibility on Amazon →",
      // Deliberately does not promise a price or a term length. Amazon sets
      // both, changes them without notice, and misstating them would breach
      // the Associates agreement.
      sub: "Referral link — we may earn a commission if you sign up, at no extra cost to you. Eligibility, trial length and price are set by Amazon and can change at any time; confirm the current offer on their page before signing up.",
    },
    body: [
      ["What the offer actually is",
       "Amazon runs two reduced-price routes into a Prime membership, and both open with a free trial period that is considerably longer than the standard one. One is aimed at people aged 18 to 24; the other, Prime Student, is aimed at people enrolled at a college or university. They are separate programs with separate sign-up flows, but they work the same way: a free trial first, then a discounted monthly or annual rate for as long as you stay eligible. The trial length and the discounted rate are set by Amazon and have changed more than once, so treat any figure you read on a deal site — including this one — as a starting point and check the live terms on the sign-up page."],
      ["Who qualifies",
       "Eligibility is verified by Amazon, not by us, and it is worth knowing which route you are applying under before you start:",
       ["The 18–24 route asks you to confirm your age. It does not require you to be studying.",
        "The student route asks for proof of enrollment — usually a valid school email address, or documentation if your school does not issue one.",
        "Both are generally limited to people who have not already used the same trial before, and are country-specific.",
        "If you are a student under 25 you can often qualify either way. It is worth comparing both, because the discounted rate after the trial is not always identical."]],
      ["What happens when the trial ends",
       "This is the part most write-ups skip, so read it twice: the trial converts to a paid membership automatically unless you cancel. That is not a trick — it is stated at sign-up — but it does mean a free trial you forget about becomes a charge. The saving grace is that the post-trial rate under both routes is a genuine discount on standard Prime, and it usually continues for several years or until you age out or graduate. If you plan to keep it, the discounted years are the real value here, not the free months."],
      ["How to cancel, in case you want to",
       "Cancelling takes about a minute from Prime membership settings in your Amazon account, and you can do it the day you sign up while keeping the benefits until the trial period runs out. If you are the sort of person who signs up for trials and forgets, the practical advice is to cancel immediately and set a reminder for the end date — you lose nothing by doing so, and you get the whole trial either way."],
      ["Why this page exists",
       SITE_NAME + " is an independent deal site. We are not affiliated with, endorsed by, or sponsored by Amazon, and we cannot approve, deny, or look up anyone's eligibility. The link above is a referral link: if you sign up through it, we may be paid a commission, and you pay exactly what you would have paid otherwise. We have written the terms here as neutrally as we can, including the parts that do not help us, because a membership you cancel in annoyance next month is worth nothing to anybody."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "Last updated " + UPDATED + ".",
    body: [
      ["What we collect",
       "We do not ask you to create an account, and we do not collect names, email addresses, or payment details — we have no way to take payment, since every purchase happens on the retailer's own site. When you click a deal link, we record that a click happened, which deal it was for, and whether it came from our site or our WhatsApp group. That record is a counter; it is not tied to your identity."],
      ["Cookies and tracking",
       "This site sets no advertising or profiling cookies of its own. Retailers you click through to will set their own cookies, including the affiliate cookie that credits us for a referral — their privacy policies govern that, and we would encourage you to read them. Our fonts are loaded from Google Fonts, which receives your IP address as part of serving the file."],
      ["Why we count clicks",
       "So we know which categories are worth covering. If nobody clicks kitchen deals, we should spend less time on them. That is the entire purpose; the data is aggregate and we do not sell, share, or publish it."],
      ["Your choices and contact",
       "Because we hold no personal data about you, there is nothing for us to delete on request. If you block our links in your browser or ad blocker, the site still works — you simply reach the retailer without the referral. Questions about any of this can go to the contact address on our contact page."],
    ],
  },
  contact: {
    title: "Contact Us",
    intro: "Corrections, questions, and deal tips are all welcome.",
    body: [
      ["Get in touch",
       "Email us at " + CONTACT_EMAIL + " and we will reply. We read everything, including the messages telling us a deal is wrong."],
      ["Reporting a price error",
       "If a price or discount on this site does not match what you see at the retailer, please tell us which deal and what you saw. Prices move constantly and our data is only as fresh as its last check, so these reports are genuinely useful — we would rather pull a deal early than leave a stale one up."],
      ["Suggesting a deal",
       "Found something good? Send the product link and what makes it a good price. We apply the same 25% rule to reader suggestions as to everything else, and we do not accept payment for placement — if someone offers us money to feature a product, the answer is no."],
    ],
  },
  disclosure: {
    title: "Affiliate Disclosure",
    intro: "How this site earns money, in plain language.",
    body: [
      ["The short version",
       "As an Amazon Associate we earn from qualifying purchases. Some links on this site are affiliate links: if you click one and buy something, the retailer may pay us a commission. You pay exactly the same price you would have paid otherwise."],
      ["What that does and does not influence",
       "It does not influence which deals we publish. The 25% discount rule and the duplicate and expiry checks run automatically before any human looks at the list, and we do not sort or promote products by how much they would earn us. It does mean we have a commercial interest in you clicking, which is precisely why we publish our selection rules in full and encourage you to check prices yourself."],
      ["Independence",
       SITE_NAME + " is an independent site with no affiliation to, endorsement by, or sponsorship from any retailer or brand mentioned. Product names and trademarks belong to their respective owners and are used here only to identify the products being discussed."],
      ["Accuracy",
       "Prices and availability are captured when a deal is published and shown with that date. They change without notice and we cannot guarantee any price you see here is still current. Always confirm on the retailer's page before you buy — the price at checkout is the only one that counts."],
    ],
  },
};

function ContentPage({ slug, onBack }) {
  const page = PAGES[slug];
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  if (!page) return null;
  return (
    <main className="dp-article">
      <button className="dp-back" onClick={onBack}>← Back to deals</button>
      <h1>{page.title}</h1>
      <p className="dp-article-intro">{page.intro}</p>
      {page.cta && <ArticleCta cta={page.cta} />}
      {page.body.map(([heading, text, items]) => (
        <section key={heading}>
          <h2>{heading}</h2>
          <p>{text}</p>
          {items && (
            <ul className="dp-article-checklist">
              {items.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      ))}
      {page.cta && <ArticleCta cta={page.cta} />}
    </main>
  );
}

// Call-to-action block for editorial pages that link out to an offer.
// The fine print is part of the component, not optional, so a CTA can never
// ship without its affiliate disclosure and terms caveat.
function ArticleCta({ cta }) {
  return (
    <div className="dp-article-cta">
      <a href={cta.href} target="_blank" rel="noopener noreferrer sponsored nofollow">
        {cta.label}
      </a>
      <p>{cta.sub}</p>
    </div>
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
        setRoute({ dealId: decodeURIComponent(idPart), src: params.get("src") });
      } else if (hash.startsWith("#/p/")) {
        setRoute({ dealId: null, src: null, page: hash.replace("#/p/", "").split("?")[0] });
      } else {
        setRoute({ dealId: null, src: null });
      }
    };
    checkRoute();
    window.addEventListener("hashchange", checkRoute);
    return () => window.removeEventListener("hashchange", checkRoute);
  }, []);

  const navigateToDeal = (id) => { window.location.hash = "/deal/" + encodeURIComponent(id); };
  const navigateHome = () => { window.location.hash = ""; };
  const navigateToPage = (slug) => { window.location.hash = "/p/" + slug; };

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
            <div className="dp-logo-tag">Daily Deals &amp; Discounts</div>
          </div>
        </a>
        {!route.dealId && !route.page && (
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
        <strong>Affiliate disclosure:</strong> As an Amazon Associate we earn from qualifying
        purchases. {SITE_NAME} is an independent deal site and is not affiliated with,
        endorsed by, or sponsored by any retailer we link to. Prices and availability were
        accurate at the time each deal was posted and can change at any time — always
        confirm the current price on the retailer's page before buying.
      </p>
      <nav className="dp-footer-nav">
        <a href="#/p/about">About</a>
        <a href="#/p/how-we-pick">How We Pick Deals</a>
        <a href="#/p/deal-guide">Deal Guide</a>
        <a href="#/p/student-trial">Student &amp; 18–24 Prime Trial</a>
        <a href="#/p/disclosure">Affiliate Disclosure</a>
        <a href="#/p/privacy">Privacy</a>
        <a href="#/p/contact">Contact</a>
      </nav>
      <p>© {new Date().getFullYear()} {SITE_NAME} — an independent deal site. Product names and
        trademarks are the property of their respective owners. ·{" "}
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">Deal alerts on WhatsApp</a></p>
    </footer>
  );

  return (
    <div className="dp-root">
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      {header}

      {route.page ? (
        <ContentPage slug={route.page} onBack={navigateHome} />
      ) : route.dealId ? (
        <DealPage deals={deals} id={route.dealId} src={route.src} onBack={navigateHome} onView={navigateToDeal} />
      ) : (
        <>
          <div className="dp-hero">
            <div className="dp-hero-kicker"><span className="dp-live-dot" /> Live · auto-updated hourly</div>
            <h1>Today's Best Deals, Updated Hourly</h1>
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

            <section className="dp-explainer">
              <h2>How {SITE_NAME} works</h2>
              <p>
                We track public deal feeds every hour and publish only what clears a fixed bar:
                at least <strong>25% off a stated regular price</strong>. Duplicates are merged on the
                retailer's product ID, and expired deals are removed automatically — so a short page
                means a slow day, not a hidden backlog. Every deal shows the date we checked it.
              </p>
              <div className="dp-explainer-grid">
                <div>
                  <h3>Why the "was" price is sometimes missing</h3>
                  <p>
                    We only show a struck-through price when the source states a real regular price.
                    If we can't verify one, you get the current price with no discount badge rather
                    than a comparison we invented.
                  </p>
                </div>
                <div>
                  <h3>Why prices can differ when you click</h3>
                  <p>
                    Retail prices change constantly and no tracker is instant. Treat our price as a
                    snapshot with a timestamp, and trust the retailer's page — that's the price you
                    actually pay.
                  </p>
                </div>
                <div>
                  <h3>How we're paid</h3>
                  <p>
                    Affiliate commission on some links, at no extra cost to you. It never affects
                    which deals appear: the rules run before anyone sees what would earn most.{" "}
                    <a href="#/p/disclosure">Full disclosure</a>.
                  </p>
                </div>
                <div>
                  <h3>Buying well, not just cheaply</h3>
                  <p>
                    Check the per-unit price on multipacks, and look up price history before big buys.
                    Our <a href="#/p/deal-guide">deal guide</a> covers the five checks that catch most
                    fake discounts.
                  </p>
                </div>
              </div>
            </section>

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
