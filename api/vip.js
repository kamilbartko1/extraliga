// /api/vip.js
import { Redis } from "@upstash/redis";
import { requireAuth } from "./_auth.js";  // 🔥 dôležitý import

// Redis inicializácia
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis kľúče pre VIP
const VIP_USERS_KEY = "VIP_USERS";
const vipPlayersKey = (userId) => `VIP_MTG:${userId}`;
const vipHistoryKey = (userId, player) =>
  `VIP_MTG_HISTORY:${userId}:${player}`;

// ------------------------------
// Pomocné funkcie
// ------------------------------

function safeParse(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object" && raw !== null) {
      if (raw.value && typeof raw.value === "string")
        return JSON.parse(raw.value);
      return raw;
    }
    return {};
  } catch {
    return {};
  }
}

function normalizePlayer(obj) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    started: obj.started || null,
    lastUpdate: obj.lastUpdate || null,
    teamAbbrev: obj.teamAbbrev || obj.team || null,
  };
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ------------------------------
// Hlavný Handler
// ------------------------------

export default async function handler(req, res) {
  try {
    const task = req.query.task || null;

    // 🔥 ZÍSKANIE REÁLNEHO USERA CEZ TOKEN
    const userId = requireAuth(req, res);
    if (!userId) return; // ak nemá token →Unauthorized

    // ------------------------------------------
    // 1) STATUS – je VIP? (existuje v VIP_USERS)
    // ------------------------------------------
    if (task === "status") {
      const isVip = await redis.sismember(VIP_USERS_KEY, userId);

      return res.json({
        ok: true,
        userId,
        isVip: !!isVip,
      });
    }

    // ------------------------------------------
    // 2) GET_PLAYERS – hráči používateľa
    // ------------------------------------------
    if (task === "get_players") {
      const key = vipPlayersKey(userId);
      const playersRaw = (await redis.hgetall(key)) || {};

      const players = {};
      let totalProfit = 0;

      for (const [name, raw] of Object.entries(playersRaw)) {
        const obj = normalizePlayer(safeParse(raw));
        players[name] = obj;
        totalProfit += obj.balance;
      }

      return res.json({
        ok: true,
        userId,
        players,
        totalProfit: Number(totalProfit.toFixed(2)),
      });
    }

    // ------------------------------------------
    // 3) ADD_PLAYER – pridanie hráča
    // ------------------------------------------
    if (task === "add_player") {
      const name = req.query.name || null;
      const teamAbbrev = req.query.team || null;

      if (!name || !teamAbbrev) {
        return res.status(400).json({
          ok: false,
          error: "Missing name or team (use ?name=...&team=...)",
        });
      }

      const now = todayISO();
      const key = vipPlayersKey(userId);

      const playerState = normalizePlayer({
        stake: 1,
        streak: 0,
        balance: 0,
        started: now,
        lastUpdate: now,
        teamAbbrev,
      });

      await redis.hset(key, {
        [name]: JSON.stringify(playerState),
      });

      // Pridáme usera do VIP skupiny
      await redis.sadd(VIP_USERS_KEY, userId);

      return res.json({
        ok: true,
        userId,
        player: name,
        teamAbbrev,
      });
    }

    // ------------------------------------------
    // 4) HISTORY – história hráča
    // ------------------------------------------
    if (task === "history") {
      const player = req.query.player;
      if (!player) {
        return res.status(400).json({
          ok: false,
          error: "Missing player (use ?player=...)",
        });
      }

      const key = vipHistoryKey(userId, player);
      const raw = await redis.get(key);
      let history = [];

      if (raw) {
        history = typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
        if (!Array.isArray(history)) history = [];
      }

      return res.json({
        ok: true,
        userId,
        player,
        history,
      });
    }

    // ------------------------------------------
    // DEFAULT
    // ------------------------------------------
    return res.json({
      ok: true,
      message:
        "VIP endpoint ready. Use ?task=status|get_players|add_player|history",
    });
  } catch (err) {
    console.error("❌ VIP API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
