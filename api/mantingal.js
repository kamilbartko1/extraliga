// /api/mantingal.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const M_PLAYERS = "MANTINGAL_PLAYERS";

// ============================
// 🔧 Bezpečné JSON parsovanie
// ============================
function safeParse(raw) {
  try {
    if (!raw) return {};

    // string -> JSON
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }

    // Upstash niekedy vracia { value: "..." }
    if (typeof raw === "object" && raw !== null) {
      if (raw.value && typeof raw.value === "string") {
        try {
          return JSON.parse(raw.value);
        } catch {
          return {};
        }
      }

      // už je to normálny objekt (napr. { stake: 2, ... })
      return raw;
    }

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

      let data = safeParse(players[player]);
      data = normalizePlayer(data);

      const histRaw = await redis.get(`MANTINGAL_HISTORY:${player}`);
      let history = [];

      if (histRaw) {
        try {
          history = typeof histRaw === "string" ? JSON.parse(histRaw) : safeParse(histRaw);
          if (!Array.isArray(history)) history = [];
        } catch {
          history = [];
        }
      }

      // doplnenie played flag
      history = history.map((e) => ({
        ...e,
        played: e.goals !== null, // null = skip
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
        totalProfit += obj.balance;
      }

      return res.json({
        ok: true,
        players: parsed,
        totalProfit: Number(totalProfit.toFixed(2)),
      });
    }

    // ==========================================================
    // 📌 3) DENNÝ PROFIT (pre graf)
    // ==========================================================
    if (query.task === "daily") {
      const players = await redis.hgetall(M_PLAYERS) || {};
      const daily = {};

      for (const player of Object.keys(players)) {
        const rawHist = await redis.get(`MANTINGAL_HISTORY:${player}`);
        let hist = [];

        if (rawHist) {
          try {
            hist = typeof rawHist === "string" ? JSON.parse(rawHist) : safeParse(rawHist);
            if (!Array.isArray(hist)) hist = [];
          } catch {
            hist = [];
          }
        }

        for (const e of hist) {
          if (!e.date) continue;
          if (!daily[e.date]) daily[e.date] = 0;
          daily[e.date] += Number(e.profitChange ?? 0);
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
    // 📌 DEFAULT – všetci + súhrn
    // ==========================================================
    const players = await redis.hgetall(M_PLAYERS) || {};
    const parsed = {};
    let totalProfit = 0;

    for (const [name, raw] of Object.entries(players)) {
      const obj = normalizePlayer(safeParse(raw));
      parsed[name] = obj;
      totalProfit += obj.balance;
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
