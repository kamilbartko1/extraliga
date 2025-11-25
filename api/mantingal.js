// /api/mantingal.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Centrálne úložisko
const M_PLAYERS = "MANTINGAL_PLAYERS";

export default async function handler(req, res) {
  try {
    const query = req.query;

    // ============================
    // 📌 1) DETAIL HRÁČA
    // ============================
    if (query.player) {
      const player = query.player;

      const players = await redis.hgetall(M_PLAYERS);
      if (!players[player]) {
        return res.json({ ok: false, error: "Player not found" });
      }

      let data = safeJson(players[player]);

      const historyRaw = await redis.get(`MANTINGAL_HISTORY:${player}`);
      let history = historyRaw ? safeJson(historyRaw) : [];

      // 🔥 Doplníme flag played: true/false
      history = history.map(h => ({
        ...h,
        played: h.goals !== null   // null = SKIP = nehral
      }));

      return res.json({
        ok: true,
        player,
        ...data,
        history,
      });
    }

    // ============================
    // 📌 2) VŠETCI HRÁČI + SUMÁR
    // ============================
    if (query.task === "all") {
      const players = await redis.hgetall(M_PLAYERS) || {};
      let parsed = {};
      let totalProfit = 0;

      for (const [name, raw] of Object.entries(players)) {
        const obj = safeJson(raw);
        parsed[name] = obj;
        totalProfit += obj.balance || 0;
      }

      totalProfit = Number(totalProfit.toFixed(2));

      return res.json({
        ok: true,
        players: parsed,
        totalProfit,
      });
    }

    // ============================
    // 📌 3) DENNÝ PROFIT PRE GRAF
    // ============================
    if (query.task === "daily") {
      const players = await redis.hgetall(M_PLAYERS) || {};

      const daily = {};

      for (const player of Object.keys(players)) {
        const rawHist = await redis.get(`MANTINGAL_HISTORY:${player}`);
        const hist = rawHist ? safeJson(rawHist) : [];

        for (const h of hist) {
          if (!daily[h.date]) daily[h.date] = 0;
          daily[h.date] += h.profitChange;
        }
      }

      const list = Object.keys(daily)
        .sort()
        .map(date => ({
          date,
          profit: Number(daily[date].toFixed(2)),
        }));

      return res.json({
        ok: true,
        dailyProfit: list,
      });
    }

    // ============================
    // 📌 4) DEFAULT → všetko dokopy
    // ============================
    const players = await redis.hgetall(M_PLAYERS) || {};
    let parsed = {};
    let totalProfit = 0;

    for (const [name, raw] of Object.entries(players)) {
      const obj = safeJson(raw);
      parsed[name] = obj;
      totalProfit += obj.balance || 0;
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
    return res.json({
      ok: false,
      error: err.message,
    });
  }
}


// ============================
// 🔧 Bezpečné JSON parsovanie
// ============================
function safeJson(raw) {
  try {
    if (typeof raw === "object" && raw !== null && raw.value) {
      return JSON.parse(raw.value);
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
// /api/mantingal.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Centrálne úložisko
const M_PLAYERS = "MANTINGAL_PLAYERS";

export default async function handler(req, res) {
  try {
    const query = req.query;

    // ============================
    // 📌 1) DETAIL HRÁČA
    // ============================
    if (query.player) {
      const player = query.player;

      const players = await redis.hgetall(M_PLAYERS);
      if (!players[player]) {
        return res.json({ ok: false, error: "Player not found" });
      }

      let data = safeJson(players[player]);

      const historyRaw = await redis.get(`MANTINGAL_HISTORY:${player}`);
      let history = historyRaw ? safeJson(historyRaw) : [];

      // 🔥 Doplníme flag played: true/false
      history = history.map(h => ({
        ...h,
        played: h.goals !== null   // null = SKIP = nehral
      }));

      return res.json({
        ok: true,
        player,
        ...data,
        history,
      });
    }

    // ============================
    // 📌 2) VŠETCI HRÁČI + SUMÁR
    // ============================
    if (query.task === "all") {
      const players = await redis.hgetall(M_PLAYERS) || {};
      let parsed = {};
      let totalProfit = 0;

      for (const [name, raw] of Object.entries(players)) {
        const obj = safeJson(raw);
        parsed[name] = obj;
        totalProfit += obj.balance || 0;
      }

      totalProfit = Number(totalProfit.toFixed(2));

      return res.json({
        ok: true,
        players: parsed,
        totalProfit,
      });
    }

    // ============================
    // 📌 3) DENNÝ PROFIT PRE GRAF
    // ============================
    if (query.task === "daily") {
      const players = await redis.hgetall(M_PLAYERS) || {};

      const daily = {};

      for (const player of Object.keys(players)) {
        const rawHist = await redis.get(`MANTINGAL_HISTORY:${player}`);
        const hist = rawHist ? safeJson(rawHist) : [];

        for (const h of hist) {
          if (!daily[h.date]) daily[h.date] = 0;
          daily[h.date] += h.profitChange;
        }
      }

      const list = Object.keys(daily)
        .sort()
        .map(date => ({
          date,
          profit: Number(daily[date].toFixed(2)),
        }));

      return res.json({
        ok: true,
        dailyProfit: list,
      });
    }

    // ============================
    // 📌 4) DEFAULT → všetko dokopy
    // ============================
    const players = await redis.hgetall(M_PLAYERS) || {};
    let parsed = {};
    let totalProfit = 0;

    for (const [name, raw] of Object.entries(players)) {
      const obj = safeJson(raw);
      parsed[name] = obj;
      totalProfit += obj.balance || 0;
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
    return res.json({
      ok: false,
      error: err.message,
    });
  }
}


// ============================
// 🔧 Bezpečné JSON parsovanie
// ============================
function safeJson(raw) {
  try {
    if (typeof raw === "object" && raw !== null && raw.value) {
      return JSON.parse(raw.value);
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
