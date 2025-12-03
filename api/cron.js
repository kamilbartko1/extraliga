import axios from "axios";
import { Redis } from "@upstash/redis";

// 🌐 Globálna BASE premenná (bude nastavená v handleri)
let base = "";

// Inicializácia Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// =======================================
// 🔧 Pomocné funkcie pre Mantingal
// =======================================

const M_PLAYERS = "MANTINGAL_PLAYERS";

// bezpečné JSON
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

// normalizácia mena (ako pri AI)
function normalizeName(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// garantovaná štruktúra hráča (ako v /api/mantingal)
function normalizePlayer(obj) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    started: obj.started || null,
    lastUpdate: obj.lastUpdate || null,
  };
}

// uloženie do histórie
async function appendHistory(player, entry) {
  const key = `MANTINGAL_HISTORY:${player}`;
  let hist = [];

  const raw = await redis.get(key);
  if (raw) {
    try {
      hist = typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
      if (!Array.isArray(hist)) hist = [];
    } catch {
      hist = [];
    }
  }

  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}

// ===============================================
// 🔥 Mantingal vyhodnocovanie cez SCORE API
//    – iba podľa games[].goals[]
// ===============================================
async function updateMantingalePlayers() {
  console.log("🔥 Mantingal: vyhodnocujem podľa SCORE API (goals[])...");

  // včerajší dátum (vždy "včerajšie" zápasy)
  const y = new Date(Date.now() - 86400000)
    .toISOString()
    .slice(0, 10);

  const url = `https://api-web.nhle.com/v1/score/${y}`;

  // stiahni včerajší SCORE
  let data;
  try {
    const r = await axios.get(url, { timeout: 15000 });
    data = r.data || {};
  } catch (err) {
    console.log("❌ SCORE API ERROR:", err.message);
    return;
  }

  const games = data.games || [];
  if (!games.length) {
    console.log("⚠️ Včera neboli žiadne zápasy.");
    return;
  }

  // načítaj mantingal hráčov
  const players = await redis.hgetall(M_PLAYERS);
  if (!players || Object.keys(players).length === 0) {
    console.log("⚠️ Žiadni mantingale hráči.");
    return;
  }

  // Index gólov podľa mena hráča (normalizeName)
  // normName -> { goals, gameId }
  const goalsIndex = {};

  for (const g of games) {
    const gameId = g.id;
    const goalsArr = g.goals || [];

    for (const ev of goalsArr) {
      const nameDefault = ev.name?.default || ""; // napr. "N. Suzuki"
      const norm = normalizeName(nameDefault);
      if (!norm) continue;

      if (!goalsIndex[norm]) {
        goalsIndex[norm] = {
          goals: 0,
          gameId,
        };
      }

      goalsIndex[norm].goals += 1; // 2 góly = 2 zápisy v goals[]
    }
  }

  // PRE KAŽDÉHO MANTINGAL HRÁČA
  for (const [playerName, rawState] of Object.entries(players)) {
    let state = normalizePlayer(safeParse(rawState));
    const normPlayerName = normalizeName(playerName);

    const stats = goalsIndex[normPlayerName] || null;
    const hasGoal = stats && stats.goals > 0;

    // === HIT – hráč dal aspoň 1 gól podľa goals[]
    if (hasGoal) {
      const goalsCount = stats.goals;
      const profit = Number((state.stake * 1.2).toFixed(2));
      const before = state.balance;

      state.balance = Number((before + profit).toFixed(2));
      state.stake = 1;
      state.streak = 0;
      state.lastUpdate = y;

      await appendHistory(playerName, {
        date: y,
        gameId: stats.gameId,
        goals: goalsCount,
        result: "hit",
        profitChange: profit,
        balanceAfter: state.balance,
      });

      await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

      console.log(
        "🎯 HIT:",
        playerName,
        `goals=${goalsCount}`,
        `+${profit}€`,
        "gameId=" + stats.gameId
      );
      continue;
    }

    // === MISS – hráč včera podľa goals[] neskóroval
    const loss = -state.stake;
    const before = state.balance;

    state.balance = Number((before + loss).toFixed(2));
    state.stake = state.stake * 2;
    state.streak += 1;
    state.lastUpdate = y;

    await appendHistory(playerName, {
      date: y,
      gameId: null, // z SCORE bez súpisiek nevieme presný zápas pri 0 góloch
      goals: 0,
      result: "miss",
      profitChange: loss,
      balanceAfter: state.balance,
    });

    await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

    console.log("❌ MISS:", playerName, loss);
  }
}

// ===============================================
// 🔥 CRON – AI + MANTINGAL
// ===============================================
export default async function handler(req, res) {
  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;

    base = `${proto}://${host}`;

    let executed = null;

    // 1) UPDATE + MANTINGAL
    // (čas máš aktuálne nastavený na 15:00 UTC, nechávam tak ako si poslal)
    if (utcHour === 15 && utcMinute < 50) {
      await axios.get(`${base}/api/ai?task=update`);
      await updateMantingalePlayers();
      executed = "update + mantingale";
    }

    // 2) SCORER
    else if (utcHour === 12 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=scorer`);
      executed = "scorer";
    }

    // 3) SAVE
    else if (utcHour === 13 && utcMinute < 22) {
      await axios.get(`${base}/api/ai?task=save`);
      executed = "save";
    }

    return res.json({
      ok: true,
      time: now.toISOString(),
      executed: executed || "nothing",
    });
  } catch (err) {
    console.error("❌ CRON ERROR:", err);
    return res.json({ ok: false, error: err.message });
  }
}
