import { useState, useEffect } from "react";
 
const CATEGORIES = ["All", "Electronics", "Home & Kitchen", "Fashion", "Sports", "Beauty", "Furniture", "Toys & Games", "General"];
 
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
    expires: "2026-06-20",
    hot: true,
  },
  {
    id: "demo2",
    title: "Instant Pot Duo 7-in-1 Electric Pressure Cooker",
    category: "Home & Kitchen",
    originalPrice: 99.95,
    dealPrice: 59.99,
    discount: 40,
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&q=80",
    affiliate_url: "https://amazon.com/?tag=youraffid-20",
    store: "Amazon",
    expires: "2026-06-21",
    hot: true,
  },
];
 
const TagBadge = ({ label, color }) => (
  <span style={{
    background: color, color: "#fff", fontSize: "10px", fontWeight: "700",
    letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", borderRadius: "4px",
  }}>{label}</span>
);
 
// ── SINGLE DEAL PAGE ──────────────────────────────────────────────────────────
function DealPage({ deals, id, onBack }) {
  const deal = deals.find(d => d.id === id);
 
  if (!deal) return (
    <div style={{ textAlign: "center", padding: "80px 20px", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ fontSize: "48px" }}>🔍</div>
      <p style={{ fontSize: "18px", color: "#666" }}>Deal not found.</p>
      <button onClick={onBack} style={{ marginTop: "16px", padding: "10px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
        Back to Deals
      </button>
    </div>
  );
 
  const savings = deal.originalPrice > 0 ? (deal.originalPrice - deal.dealPrice).toFixed(2) : null;
  const daysLeft = deal.expires ? Math.max(0, Math.ceil((new Date(deal.expires) - new Date()) / 86400000)) : null;
  const shareUrl = window.location.origin + "/share/deal/" + encodeURIComponent(deal.id);
 
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    alert("Link copied to clipboard!");
  };
 
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "DM Sans, Segoe UI, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
 
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "0 24px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "center", height: "64px", gap: "16px" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600", color: "#555", display: "flex", alignItems: "center", gap: "6px" }}>
            ← Back to Deals
          </button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", background: "#f90", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>⚡</div>
            <span style={{ fontWeight: "800", fontSize: "16px", color: "#1a1a2e" }}>DealsPulse</span>
          </div>
        </div>
      </header>
 
      {/* Deal Content */}
      <main style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ background: "#fff", borderRadius: "20px", overflow: "hidden", boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>
 
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0" }}>
 
            {/* Image */}
            <div style={{ background: "#f8f8f8", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", minHeight: "350px" }}>
              <img
                src={deal.image}
                alt={deal.title}
                style={{ maxWidth: "100%", maxHeight: "300px", objectFit: "contain", borderRadius: "8px" }}
              />
            </div>
 
            {/* Info */}
            <div style={{ padding: "36px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
                {deal.hot && <TagBadge label="Hot Deal" color="#e53935" />}
                <TagBadge label={deal.category} color="#6c63ff" />
                {deal.discount > 0 && <TagBadge label={"-" + deal.discount + "% OFF"} color="#2e7d32" />}
              </div>
 
              <h1 style={{ margin: "0 0 20px", fontSize: "22px", fontWeight: "700", color: "#1a1a2e", lineHeight: 1.4 }}>
                {deal.title}
              </h1>
 
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "36px", fontWeight: "800", color: "#1a1a2e" }}>
                  {deal.dealPrice > 0 ? "$" + deal.dealPrice.toFixed(2) : "See Price"}
                </span>
                {deal.originalPrice > 0 && (
                  <span style={{ fontSize: "18px", color: "#aaa", textDecoration: "line-through" }}>
                    ${deal.originalPrice.toFixed(2)}
                  </span>
                )}
              </div>
 
              {savings && <p style={{ margin: "0 0 20px", fontSize: "14px", color: "#4caf50", fontWeight: "600" }}>You save ${savings}!</p>}
 
              {daysLeft !== null && (
                <p style={{ margin: "0 0 24px", fontSize: "13px", color: daysLeft <= 1 ? "#e53935" : "#888" }}>
                  {daysLeft > 0 ? "Expires in " + daysLeft + " day" + (daysLeft > 1 ? "s" : "") : "Expires today!"}
                </p>
              )}
 
              <a
                href={deal.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block", background: "#f90", color: "#111", textDecoration: "none",
                  borderRadius: "12px", padding: "16px", fontWeight: "700", fontSize: "16px",
                  textAlign: "center", marginBottom: "12px",
                }}
              >
                View on Amazon →
              </a>
 
              <button
                onClick={copyLink}
                style={{
                  display: "block", width: "100%", background: "#fff", color: "#1a1a2e",
                  border: "2px solid #e5e5e5", borderRadius: "12px", padding: "14px",
                  fontWeight: "600", fontSize: "14px", cursor: "pointer",
                }}
              >
                📋 Copy Deal Link
              </button>
 
              {/* WhatsApp share */}
              <a
                href={"https://wa.me/?text=" + encodeURIComponent("Check out this deal! " + deal.title + " - " + shareUrl)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block", background: "#25d366", color: "#fff", textDecoration: "none",
                  borderRadius: "12px", padding: "14px", fontWeight: "600", fontSize: "14px",
                  textAlign: "center", marginTop: "12px",
                }}
              >
                💬 Share on WhatsApp
              </a>
            </div>
          </div>
        </div>
 
        <button onClick={onBack} style={{ marginTop: "24px", padding: "12px 24px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
          ← Back to All Deals
        </button>
      </main>
    </div>
  );
}
 
// ── DEAL CARD ─────────────────────────────────────────────────────────────────
const DealCard = ({ deal, onView }) => {
  const savings = deal.originalPrice > 0 ? (deal.originalPrice - deal.dealPrice).toFixed(2) : null;
  const daysLeft = deal.expires ? Math.max(0, Math.ceil((new Date(deal.expires) - new Date()) / 86400000)) : null;
 
  return (
    <div
      style={{
        background: "#fff", borderRadius: "16px", overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)", display: "flex",
        flexDirection: "column", cursor: "pointer", transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)"; }}
      onClick={() => onView(deal.id)}
    >
      <div style={{ position: "relative" }}>
        <img src={deal.image} alt={deal.title} style={{ width: "100%", height: "180px", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: "10px", left: "10px", display: "flex", gap: "6px" }}>
          {deal.hot && <TagBadge label="Hot" color="#e53935" />}
          {deal.discount > 0 && <TagBadge label={"-" + deal.discount + "%"} color="#2e7d32" />}
        </div>
        {daysLeft !== null && daysLeft <= 1 && (
          <div style={{ position: "absolute", top: "10px", right: "10px" }}>
            <TagBadge label="Ends Soon" color="#f57c00" />
          </div>
        )}
      </div>
      <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "11px", color: "#888", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em" }}>{deal.category}</span>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#1a1a2e", lineHeight: "1.4" }}>{deal.title}</h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
          <span style={{ fontSize: "22px", fontWeight: "800", color: "#1a1a2e" }}>
            {deal.dealPrice > 0 ? "$" + deal.dealPrice.toFixed(2) : "See Price"}
          </span>
          {deal.originalPrice > 0 && (
            <span style={{ fontSize: "14px", color: "#aaa", textDecoration: "line-through" }}>${deal.originalPrice.toFixed(2)}</span>
          )}
        </div>
        {savings && <p style={{ margin: 0, fontSize: "12px", color: "#4caf50", fontWeight: "600" }}>You save ${savings}</p>}
        <div style={{ marginTop: "auto", paddingTop: "12px", display: "flex", gap: "8px" }}>
          <button
            onClick={e => { e.stopPropagation(); onView(deal.id); }}
            style={{
              flex: 1, background: "#1a1a2e", color: "#fff", border: "none",
              borderRadius: "8px", padding: "10px", fontWeight: "700", fontSize: "13px",
              textAlign: "center", cursor: "pointer",
            }}
          >
            View Deal
          </button>
          <a
            href={deal.affiliate_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, background: "#f90", color: "#111", border: "none",
              borderRadius: "8px", padding: "10px", fontWeight: "700", fontSize: "13px",
              textAlign: "center", textDecoration: "none", cursor: "pointer",
            }}
          >
            Buy Now →
          </a>
        </div>
      </div>
    </div>
  );
};
 
// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("hot");
  const [currentDealId, setCurrentDealId] = useState(null);
 
  // Handle URL routing
  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#/deal/")) {
        setCurrentDealId(decodeURIComponent(hash.replace("#/deal/", "")));
      } else {
        setCurrentDealId(null);
      }
    };
    checkRoute();
    window.addEventListener("hashchange", checkRoute);
    return () => window.removeEventListener("hashchange", checkRoute);
  }, []);
 
  const navigateToDeal = (id) => {
    window.location.hash = "/deal/" + encodeURIComponent(id);
  };
 
  const navigateHome = () => {
    window.location.hash = "";
  };
 
  useEffect(() => {
    fetch("/deals.json")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDeals(data);
          const latest = data.reduce((a, b) => new Date(a.posted_at) > new Date(b.posted_at) ? a : b);
          setLastUpdated(new Date(latest.posted_at));
        } else {
          setDeals(FALLBACK_DEALS);
        }
      })
      .catch(() => setDeals(FALLBACK_DEALS))
      .finally(() => setLoading(false));
  }, []);
 
  // Show single deal page
  if (currentDealId) {
    return <DealPage deals={deals} id={currentDealId} onBack={navigateHome} />;
  }
 
  const filtered = deals
    .filter(d => activeCategory === "All" || d.category === activeCategory)
    .filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "hot") return (b.hot ? 1 : 0) - (a.hot ? 1 : 0);
      if (sortBy === "discount") return b.discount - a.discount;
      if (sortBy === "price_low") return a.dealPrice - b.dealPrice;
      if (sortBy === "price_high") return b.dealPrice - a.dealPrice;
      return 0;
    });
 
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "DM Sans, Segoe UI, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
 
      <header style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "0 24px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <div style={{ width: "32px", height: "32px", background: "#f90", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>⚡</div>
            <div>
              <div style={{ fontWeight: "800", fontSize: "17px", color: "#1a1a2e", lineHeight: 1 }}>DealsPulse</div>
              <div style={{ fontSize: "10px", color: "#888", letterSpacing: "0.06em", textTransform: "uppercase" }}>Best Amazon Deals</div>
            </div>
          </div>
          <input
            type="text" placeholder="Search deals..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, maxWidth: "380px", border: "1.5px solid #e5e5e5", borderRadius: "10px", padding: "9px 16px", fontSize: "14px", outline: "none", background: "#fafafa" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", color: "#888" }}>Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              style={{ border: "1.5px solid #e5e5e5", borderRadius: "8px", padding: "6px 10px", fontSize: "13px", background: "#fff", cursor: "pointer", outline: "none" }}>
              <option value="hot">Hottest</option>
              <option value="discount">% Discount</option>
              <option value="price_low">Price Low</option>
              <option value="price_high">Price High</option>
            </select>
          </div>
        </div>
      </header>
 
      <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)", color: "#fff", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <div style={{ fontSize: "13px", color: "#f90", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>Updated Automatically by Deal Bot</div>
          <h1 style={{ margin: "0 0 12px", fontSize: "42px", fontWeight: "800", lineHeight: 1.2 }}>The Best Amazon Deals</h1>
          <p style={{ margin: 0, color: "#b0b8cc", fontSize: "15px", lineHeight: 1.6 }}>Our bot scans for the hottest deals and posts them here and on WhatsApp.</p>
        </div>
      </div>
 
      <div style={{ background: "#fff", borderBottom: "1px solid #eee", padding: "0 24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", gap: "4px", overflowX: "auto", padding: "12px 0" }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              style={{ border: "none", borderRadius: "8px", padding: "7px 16px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", background: activeCategory === cat ? "#1a1a2e" : "transparent", color: activeCategory === cat ? "#fff" : "#555", transition: "all 0.15s" }}>
              {cat}
            </button>
          ))}
        </div>
      </div>
 
      <div style={{ background: "#fff3e0", borderBottom: "1px solid #ffe0b2", padding: "10px 24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", gap: "24px", fontSize: "13px", color: "#e65100", fontWeight: "600", flexWrap: "wrap" }}>
          <span>Last updated: <strong>{lastUpdated ? lastUpdated.toLocaleString() : "Loading..."}</strong></span>
          <span><strong>{deals.length}</strong> active deals</span>
        </div>
      </div>
 
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#999" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>⏳</div>
            <p>Loading deals...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#999" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🔍</div>
            <p>No deals found.</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "#1a1a2e" }}>
                {activeCategory === "All" ? "All Deals" : activeCategory} ({filtered.length})
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "20px" }}>
              {filtered.map(deal => <DealCard key={deal.id} deal={deal} onView={navigateToDeal} />)}
            </div>
          </>
        )}
      </main>
 
      <div style={{ background: "#1a1a2e", color: "#fff", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>💬</div>
          <h2 style={{ margin: "0 0 10px", fontSize: "24px" }}>Get Deals on WhatsApp</h2>
          <p style={{ color: "#b0b8cc", marginBottom: "20px", fontSize: "14px" }}>Join our group and get instant alerts the moment our bot finds a deal.</p>
          <a href="https://wa.me/yourphonenumber" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", background: "#25d366", color: "#fff", textDecoration: "none", padding: "13px 28px", borderRadius: "10px", fontWeight: "700", fontSize: "15px" }}>
            Join WhatsApp Group
          </a>
        </div>
      </div>
 
      <footer style={{ background: "#111", color: "#666", padding: "20px 24px", textAlign: "center", fontSize: "12px" }}>
        <p style={{ margin: 0 }}>2026 DealsPulse - As an Amazon Associate we earn from qualifying purchases</p>
      </footer>
    </div>
  );
}
