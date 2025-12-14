// /api/vip.js
import { Redis } from "@upstash/redis";

// ⚠️ DOČASNÉ: kým nemáme Supabase na fronte,
// používame jedného testovacieho používateľa.
// Neskôr toto nahradíme skutočným userId zo Supabase.
const DEV_USER_ID = "DEV_USER_TEST";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis kľúče pre VIP
const VIP_USERS_KEY = "VIP_USERS";
const vipPlayersKey = (userId) => `VIP_MTG:${userId}`;
const vipHistoryKey = (userId, player) => `VIP_MTG_HISTORY:${userId}:${player}`;

// Bezpečné parsovanie JSON (ako v mantingal.js)
function safeParse(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object" && raw !== null) {
      if (raw.value && typeof raw.value === "string") {
        return JSON.parse(raw.value);
      }
      return raw;
    }
    return {};
  } catch {
    return {};
  }
}

// Zabezpečí kompletnú štruktúru hráča
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

// Dnešný dátum vo formáte YYYY-MM-DD
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req, res) {
  try {
    const task = req.query.task || null;

    // ⚠️ DOČASNE: všetko robíme pre DEV_USER_ID.
    // Neskôr nahradíme za skutočné userId zo Supabase.
    const userId = DEV_USER_ID;

    // ===========================================
    // 1️⃣ STATUS – je používateľ VIP?
    // ===========================================
    if (task === "status") {
      // Zatiaľ: ak existuje v sete VIP_USERS, je VIP.
      const isVip = await redis.sismember(VIP_USERS_KEY, userId);

      return res.json({
        ok: true,
        userId,
        isVip: !!isVip,
      });
    }

    // ===========================================
    // 2️⃣ GET_PLAYERS – zoznam VIP hráčov pre usera
    // ===========================================
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

    // ===========================================
    // 3️⃣ ADD_PLAYER – pridať hráča do VIP mantingale
    // ===========================================
    if (task === "add_player") {
      // ⚠️ Aby sme nemuseli riešiť body parsing, berieme údaje z query:
      // /api/vip?task=add_player&name=Panarin&team=NYR
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

      // uložíme hráča do HASH-u
      await redis.hset(key, {
        [name]: JSON.stringify(playerState),
      });

      // pre istotu ho pridáme aj do VIP_USERS setu, aby bol „VIP“
      await redis.sadd(VIP_USERS_KEY, userId);

      return res.json({
        ok: true,
        userId,
        player: name,
        teamAbbrev,
      });
    }

    // ===========================================
    // 4️⃣ HISTORY – história jedného hráča (zatiaľ prázdna)
    // ===========================================
    if (task === "history") {
      const player = req.query.player || null;
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
        history =
          typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
        if (!Array.isArray(history)) history = [];
      }

      return res.json({
        ok: true,
        userId,
        player,
        history,
      });
    }

    // ===========================================
    // DEFAULT – info
    // ===========================================
    return res.json({
      ok: true,
      message: "VIP endpoint pripravený. Použi ?task=status|get_players|add_player|history",
    });
  } catch (err) {
    console.error("❌ VIP API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
