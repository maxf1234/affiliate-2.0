/**
 * Private click-stats dashboard (JSON)
 * URL: /api/stats            — if STATS_KEY env var is unset
 *      /api/stats?key=XXXX   — if STATS_KEY is set (recommended)
 *
 * Shows total clicks, clicks per source channel (site / deal page /
 * shared link / WhatsApp), clicks per day for the last 14 days, and the
 * all-time top 25 most-clicked deals.
 */

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function pipeline(redis, commands) {
  const resp = await fetch(`${redis.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${redis.token}` },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(4000),
  });
  const results = await resp.json();
  return results.map(r => r.result);
}

module.exports = async (req, res) => {
  if (process.env.STATS_KEY && req.query.key !== process.env.STATS_KEY) {
    res.status(401).json({ error: "Missing or wrong ?key=" });
    return;
  }

  const redis = redisConfig();
  if (!redis) {
    res.status(200).json({
      error: "Redis not configured yet.",
      how_to_fix: "In Vercel: Storage → Create Database → Upstash Redis (free). It auto-adds the env vars. Until then, clicks appear in Vercel function logs only.",
    });
    return;
  }

  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - i * 86400000);
    return d.toISOString().split("T")[0];
  });

  const sources = ["site", "deal", "share", "wa"];

  try {
    const [totals, top] = await Promise.all([
      pipeline(redis, [
        ["GET", "clicks:total"],
        ...sources.map(s => ["GET", `clicks:src:${s}`]),
        ...days.map(d => ["GET", `clicks:day:${d}`]),
      ]),
      pipeline(redis, [
        ["ZREVRANGE", "clicks:leaderboard", "0", "24", "WITHSCORES"],
        ["HGETALL", "deal:titles"],
      ]),
    ]);

    const [total, ...rest] = totals;
    const bySource = Object.fromEntries(sources.map((s, i) => [s, parseInt(rest[i] || 0)]));
    const byDay = Object.fromEntries(days.map((d, i) => [d, parseInt(rest[sources.length + i] || 0)]));

    // ZREVRANGE WITHSCORES returns [member, score, member, score, ...]
    const flat = top[0] || [];
    const titlesFlat = top[1] || [];
    const titles = {};
    for (let i = 0; i < titlesFlat.length; i += 2) titles[titlesFlat[i]] = titlesFlat[i + 1];

    const topDeals = [];
    for (let i = 0; i < flat.length; i += 2) {
      topDeals.push({ id: flat[i], clicks: parseInt(flat[i + 1]), title: titles[flat[i]] || "(title unknown)" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      total_clicks: parseInt(total || 0),
      by_source: {
        site_grid: bySource.site,
        deal_page: bySource.deal,
        shared_links: bySource.share,
        whatsapp: bySource.wa,
      },
      last_14_days: byDay,
      top_deals: topDeals,
    });
  } catch (e) {
    res.status(500).json({ error: "Stats fetch failed: " + e.message });
  }
};
