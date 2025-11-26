// /api/mantingal.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// hlavný hash
const M_PLAYERS = "MANTINGAL_PLAYERS";

// ============================
// 🔧 Bezpečné JSON parsovanie pre Upstash
// ============================
function safeParse(raw) {
  try {
    // Upstash forma: { value: "..." }
    if (raw && typeof raw === "object" && raw.value) {
      return JSON.parse(raw.value);
    }

    // Striktne string
    if (typeof raw === "string") {
      return JSON.parse(raw);
    }

    // Prázdne → vráť objekt
    return {};
  } catch {
    return {};
  }
}

// ============================
// 🔧 Garantujeme kompletnú štruktúru hráča
// ============================
function normalizePlayer(obj) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    started: obj.started || null,
    lastUpdate: obj.lastUpdate || null,
  };
}

export default async function handler(req, res) {
  try {
    const query = req.query;

    // ==========================================================
    // 📌 1) DETAIL HRÁČA
    // ==========================================================
    if (query.player) {
      const player = query.player;

      const players = await redis.hgetall(M_PLAYERS);
      if (!players || !players[player]) {
        return res.json({ ok: false, error: "Player not found" });
      }

      const data = normalizePlayer(safeParse(players[player]));

      const historyRaw = await redis.get(`MANTINGAL_HISTORY:${player}`);
      let history = Array.isArray(historyRaw) ? historyRaw : safeParse(historyRaw);

      // doplnenie played flag
      history = history.map((h) => ({
        ...h,
        played: h.goals !== null, // null = skip
      }));

      return res.json({
        ok: true,
        player,
        ...data,
        history,
      });
    }

    // ==========================================================
    // 📌 2) VŠETCI HRÁČI + SUMÁR
    // ==========================================================
    if (query.task === "all") {
      const players = await redis.hgetall(M_PLAYERS) || {};

      const parsed = {};
      let totalProfit = 0;

      for (const [name, raw] of Object.entries(players)) {
        const obj = normalizePlayer(safeParse(raw));

        parsed[name] = obj;

        // bezpečné sčítanie
        totalProfit += Number(obj.balance ?? 0);
      }

      return res.json({
        ok: true,
        players: parsed,
        totalProfit: Number(totalProfit.toFixed(2)),
      });
    }

    // ==========================================================
    // 📌 3) DENNÝ PROFIT PRE GRAF
    // ==========================================================
    if (query.task === "daily") {
      const players = await redis.hgetall(M_PLAYERS) || {};
      const daily = {};

      for (const player of Object.keys(players)) {
        const rawHist = await redis.get(`MANTINGAL_HISTORY:${player}`);
        const hist = Array.isArray(rawHist) ? rawHist : safeParse(rawHist);

        for (const item of hist) {
          if (!item?.date) continue;

          if (!daily[item.date]) daily[item.date] = 0;
          daily[item.date] += Number(item.profitChange ?? 0);
        }
      }

      const list = Object.keys(daily)
        .sort()
        .map((d) => ({
          date: d,
          profit: Number(daily[d].toFixed(2)),
        }));

      return res.json({
        ok: true,
        dailyProfit: list,
      });
    }

    // ==========================================================
    // 📌 4) DEFAULT – všetko dokopy
    // ==========================================================
    const players = await redis.hgetall(M_PLAYERS) || {};
    const parsed = {};
    let totalProfit = 0;

    for (const [name, raw] of Object.entries(players)) {
      const obj = normalizePlayer(safeParse(raw));
      parsed[name] = obj;
      totalProfit += Number(obj.balance ?? 0);
    }

    return res.json({
      ok: true,
      summary: {
        totalPlayers: Object.keys(parsed).length,
        totalProfit: Number(totalProfit.toFixed(2)),
      },
      players: parsed,
    });

  } catch (err) {
    console.error("❌ MANTINGAL ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
