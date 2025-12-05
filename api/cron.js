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

    // objekt z Upstasha
    if (typeof raw === "object" && raw !== null) {
      // prípad { value: "..." }
      if (raw.value && typeof raw.value === "string") {
        try {
          return JSON.parse(raw.value);
        } catch {
          return {};
        }
      }
      // už je to normálny objekt (stake, streak, balance, teamAbbrev...)
      return raw;
    }

    return {};
  } catch {
    return {};
  }
}

// garantovaná štruktúra hráča (aj teamAbbrev)
function normalizePlayer(obj) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    started: obj.started || null,
    lastUpdate: obj.lastUpdate || null,
    teamAbbrev: obj.teamAbbrev || obj.team || null, // dôležité!
  };
}

// normalizácia mena (ako pri AI)
function normalizeName(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
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
// ===============================================
// 🔥 Hlavný Mantingal update – SCORE + SKIP podľa klubu
// ===============================================
async function updateMantingalePlayers() {
  console.log("🔥 Mantingal: vyhodnocujem podľa SCORE API...");

  // včerajší dátum
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const url = `https://api-web.nhle.com/v1/score/${y}`;

  // stiahni včerajšie zápasy
  let games;
  try {
    const r = await axios.get(url, { timeout: 12000 });
    games = r.data?.games || [];
  } catch (err) {
    console.log("❌ SCORE API ERROR:", err.message);
    return;
  }

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

  // set tímov, ktoré včera hrali
  const teamsPlayed = new Set();
  for (const g of games) {
    if (g.homeTeam?.abbrev) teamsPlayed.add(g.homeTeam.abbrev);
    if (g.awayTeam?.abbrev) teamsPlayed.add(g.awayTeam.abbrev);
  }

  // index gólov podľa mena (normované meno -> { goals, gameId })
  const goalsIndex = {};
  for (const g of games) {
    const gameId = g.id;
    const goalsArr = g.goals || [];

    for (const ev of goalsArr) {
      const nameDefault = ev.name?.default || ""; // napr. "N. MacKinnon"
      const norm = normalizeName(nameDefault);
      if (!norm) continue;

      if (!goalsIndex[norm]) {
        goalsIndex[norm] = {
          goals: 0,
          gameId,
        };
      }
      goalsIndex[norm].goals += 1;
    }
  }

  // PRE KAŽDÉHO MANTINGAL HRÁČA
  for (const [playerName, raw] of Object.entries(players)) {
    let state = normalizePlayer(safeParse(raw));
    const normName = normalizeName(playerName);
    const stats = goalsIndex[normName] || { goals: 0, gameId: null };

    const team = state.teamAbbrev;

    // 💡 1) SKIP – klub včera vôbec nehral
    if (team && !teamsPlayed.has(team)) {
      await appendHistory(playerName, {
        date: y,
        gameId: null,
        goals: null,
        result: "skipTeam",
        profitChange: 0,
        balanceAfter: state.balance,
      });

      state.lastUpdate = y;
      await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

      console.log("⏭ SKIP (team no game):", playerName, "team:", team);
      continue;
    }

    // 💥 2) HIT – dal aspoň jeden gól
    if (stats.goals > 0) {
      const profit = Number((state.stake * 1.2).toFixed(2));
      const before = state.balance;
      state.balance = Number((before + profit).toFixed(2));

      await appendHistory(playerName, {
        date: y,
        gameId: stats.gameId,
        goals: stats.goals,
        result: "hit",
        profitChange: profit,
        balanceAfter: state.balance,
      });

      state.stake = 1;
      state.streak = 0;
      state.lastUpdate = y;

      await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });
      console.log("🎯 HIT:", playerName, "goals:", stats.goals, "profit:", profit);
      continue;
    }

    // ❌ 3) MISS – klub hral, hráč nemá gól v goals[]
    const loss = -state.stake;
    const before = state.balance;

    state.balance = Number((before + loss).toFixed(2));
    state.stake = state.stake * 2;
    state.streak += 1;

    await appendHistory(playerName, {
      date: y,
      gameId: stats.gameId, // môže byť null, ak by náhodou nebol v indexe
      goals: 0,
      result: "miss",
      profitChange: loss,
      balanceAfter: state.balance,
    });

    state.lastUpdate = y;
    await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

    console.log("❌ MISS:", playerName, "loss:", loss);
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
    if (utcHour === 13 && utcMinute < 22) {
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
    else if (utcHour === 15 && utcMinute < 22) {
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
