import axios from "axios";
import { Redis } from "@upstash/redis";

// 🌐 Globálna BASE premenná (bude nastavená v handleri)
let base = "";

// Inicializácia Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ===============================
// 🔵 Mantingal – pomocné funkcie
// ===============================

const M_PLAYERS = "MANTINGAL_PLAYERS";

// Bezpečné JSON parsovanie
function safeParse(raw) {
  try {
    if (raw && typeof raw === "object" && raw.value) {
      return JSON.parse(raw.value);
    }
    if (typeof raw === "string") return JSON.parse(raw);
    return {};
  } catch {
    return {};
  }
}

// Zápis do histórie jedného hráča
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

// ===============================
//  🔥 Hľadanie hráča v jednom boxscore
// ===============================
function findPlayerInBoxscore(box, playerName) {
  if (!box) return null;

  const all = [
    ...(box.playerByGameStats?.homeTeam?.forwards || []),
    ...(box.playerByGameStats?.homeTeam?.defense || []),
    ...(box.playerByGameStats?.awayTeam?.forwards || []),
    ...(box.playerByGameStats?.awayTeam?.defense || []),
  ];

  const target = playerName.toLowerCase();

  return (
    all.find((p) => {
      const full = `${p.firstName?.default} ${p.lastName?.default}`.toLowerCase();
      const short = `${p.firstName?.default?.[0]}. ${p.lastName?.default}`.toLowerCase();
      return full === target || short === target;
    }) || null
  );
}

// ===============================================
// 🔥 NOVÝ MANTINGAL UPDATE
// ===============================================
async function updateMantingalePlayers() {
  console.log("🔥 Spúšťam mantingale vyhodnocovanie...");

  // 1️⃣ Získaj dnešné zápasy
  const today = new Date().toISOString().slice(0, 10);

  let homeResp;
  try {
    homeResp = await axios.get(`${base}/api/home`);
  } catch (e) {
    console.log("❌ HOME API error:", e.message);
    return;
  }

  const games = homeResp.data?.matchesToday || [];
  if (!games.length) {
    console.log("⚠️ Dnes žiadne zápasy.");
    return;
  }

  // 2️⃣ Nájdi všetkých mantingal hráčov
  const players = await redis.hgetall(M_PLAYERS);
  if (!players || Object.keys(players).length === 0) {
    console.log("⚠️ Žiadni mantingale hráči.");
    return;
  }

  // 3️⃣ Stiahni boxscore pre všetky zápasy
  const boxscores = {};
  for (const game of games) {
    try {
      const url = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
      const r = await axios.get(url, { timeout: 12000 });
      boxscores[game.id] = r.data;
    } catch (err) {
      console.log("⚠️ Boxscore error", game.id, err.message);
    }
  }

  // 4️⃣ Prejdeme každého hráča mantingalu
  for (const [playerName, raw] of Object.entries(players)) {
    const state = safeParse(raw);

    let found = null;
    let foundGameId = null;

    // nájdime zápas, v ktorom hráč hral
    for (const game of games) {
      const box = boxscores[game.id];
      const p = findPlayerInBoxscore(box, playerName);
      if (p) {
        found = p;
        foundGameId = game.id;
        break;
      }
    }

    // ============================================
    // 🟨 SKIP (hráč vôbec nehral dnes)
    // ============================================
    if (!found) {
      await appendHistory(playerName, {
        date: today,
        gameId: null,
        goals: null,
        result: "skip",
        profitChange: 0,
        balanceAfter: state.balance ?? 0,
      });

      state.lastUpdate = today;

      await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

      console.log("⏭ SKIP:", playerName);
      continue;
    }

    // ============================================
    // 🟩 HIT (dal gól)
    // ============================================
    if (found.goals > 0) {
      const profit = Number((state.stake * 1.2).toFixed(2));
      state.balance = Number((state.balance + profit).toFixed(2));
      state.stake = 1;
      state.streak = 0;
      state.lastUpdate = today;

      await appendHistory(playerName, {
        date: today,
        gameId: foundGameId,
        goals: found.goals,
        result: "hit",
        profitChange: profit,
        balanceAfter: state.balance,
      });

      await redis.hset(M_PLAYERS, { [playerName]: JSON.stringify(state) });

      console.log("🎯 HIT:", playerName, profit);
      continue;
    }

    // ============================================
    // ❌ MISS (hral ale nedal gól)
    // ============================================
    const loss = -state.stake;
    state.balance = Number((state.balance + loss).toFixed(2));
    state.stake = state.stake * 2;
    state.streak = state.streak + 1;
    state.lastUpdate = today;

    await appendHistory(playerName, {
      date: today,
      gameId: foundGameId,
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
// 🔥 Hlavný CRON – AI + MANTINGAL
// ===============================================
export default async function handler(req, res) {
  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;

    // 👇 TERAZ je base globálne a viditeľné pre všetky funkcie
    base = `${proto}://${host}`;

    let executed = null;

    //
    // 🔵 1) UPDATE (09:00 CET → 08:00 UTC)
    //
    if (utcHour === 8 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=update`);
      await updateMantingalePlayers();
      executed = "update + mantingale";
    }

    //
    // 🔵 2) SCORER (13:00 UTC)
    //
    else if (utcHour === 12 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=scorer`);
      executed = "scorer";
    }

    //
    // 🔵 3) SAVE (uloží AI strelca + MANTINGAL hráča)
    //
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
