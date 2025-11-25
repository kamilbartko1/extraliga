import axios from "axios";
import { Redis } from "@upstash/redis";

// Inicializácia Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ===============================
// 🔵 Mantingal – pomocné funkcie
// ===============================

// Centrálny zoznam hráčov
const M_PLAYERS = "MANTINGAL_PLAYERS"; 
// História hráčov: "MANTINGAL_HISTORY:<player>"

// Vytvorenie nového hráča
async function addMantingalePlayer(player) {
  const players = (await redis.hgetall(M_PLAYERS)) || {};

  // Ak hráč už existuje, NIČ nerobíme
  if (players[player]) return;

  const entry = {
    stake: 1,
    streak: 0,
    balance: 0,
    started: new Date().toISOString().slice(0, 10),
    lastUpdate: null
  };

  await redis.hset(M_PLAYERS, { [player]: JSON.stringify(entry) });
  await redis.set(`MANTINGAL_HISTORY:${player}`, JSON.stringify([]));
}

// Získanie boxscore gólov – ROZLÍŠI HRAL / NEHRAL
async function getGoals(gameId, playerShortName) {
  try {
    const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
    const res = await axios.get(url);
    const raw = res.data.playerByGameStats;

    const all = [
      ...(raw.homeTeam.forwards || []),
      ...(raw.homeTeam.defense || []),
      ...(raw.awayTeam.forwards || []),
      ...(raw.awayTeam.defense || []),
    ];

    const normalized = playerShortName.toLowerCase();

    const found = all.find((p) => {
      const full = `${p.firstName?.default} ${p.lastName?.default}`.toLowerCase();
      const short = `${p.firstName?.default?.[0]}. ${p.lastName?.default}`.toLowerCase();
      return full === normalized || short === normalized;
    });

    // ❗ Rozdiel: ak hráč NEHRAL → null
    if (!found) return null;

    return Number(found.goals || 0);
  } catch (err) {
    console.warn("Boxscore error:", err.message);
    return null; // Ak boxscore nedostupný → tiež SKIP
  }
}

// Zápis do histórie
async function appendHistory(player, entry) {
  const key = `MANTINGAL_HISTORY:${player}`;
  let hist = await redis.get(key);
  hist = hist ? JSON.parse(hist) : [];
  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}

// UPDATE pre všetkých hráčov
async function updateMantingalePlayers() {
  const players = await redis.hgetall(M_PLAYERS);
  if (!players) return;

  // 1. Získame AI históriu – potrebujeme gameId a dátumy
  const aiTips = await redis.hgetall("AI_TIPS_HISTORY");
  if (!aiTips) return;

  const aiList = Object.values(aiTips).map((raw) => {
    try { return JSON.parse(typeof raw === "object" ? raw.value : raw); }
    catch { return null; }
  }).filter(Boolean);

  // Index pre hráča → zoznam jeho zápasov
  const index = {};
  for (const tip of aiList) {
    if (!index[tip.player]) index[tip.player] = [];
    index[tip.player].push({
      date: tip.date,
      gameId: tip.gameId
    });
  }

  // 2. Prejdeme každého hráča v Mantingale
  for (const [player, raw] of Object.entries(players)) {
    let data;
    try { data = JSON.parse(raw.value || raw); }
    catch { continue; }

    // Nájdeme najbližší zápas, ktorý ešte nebol updatnutý
    const records = index[player] || [];
    const pending = records.find(r => r.date !== data.lastUpdate);

    if (!pending) continue; // nič nové

    const goals = await getGoals(pending.gameId, player);
    const today = new Date().toISOString().slice(0, 10);

let profitChange = 0;
let result = "";

// --------------------------------------
// SKIP – hráč NEHRAL
// --------------------------------------
if (goals === null) {
  result = "skip";

  data.lastUpdate = pending.date;

  await appendHistory(player, {
    date: pending.date,
    gameId: pending.gameId,
    stake: data.stake,
    goals: null,
    result: "skip",
    profitChange: 0,
    balanceAfter: data.balance
  });

  await redis.hset(M_PLAYERS, { [player]: JSON.stringify(data) });
  console.log("Mantingale SKIP:", player);

  continue; // ❗ preskočiť hráča, nepokračovať
}

// --------------------------------------
// HIT (hráč dal gól)
// --------------------------------------
if (goals > 0) {
  result = "hit";
  profitChange = Number((data.stake * 1.2).toFixed(2));

  data.balance = Number((data.balance + profitChange).toFixed(2));
  data.stake = 1;
  data.streak = 0;
}

// --------------------------------------
// MISS (hráč hral, ale nedal gól)
// --------------------------------------
else if (goals === 0) {
  result = "miss";
  profitChange = -data.stake;

  data.balance = Number((data.balance + profitChange).toFixed(2));
  data.stake = data.stake * 2;
  data.streak += 1;
}

data.lastUpdate = pending.date;

// uložiť po vyhodnotení
await redis.hset(M_PLAYERS, { [player]: JSON.stringify(data) });

await appendHistory(player, {
  date: pending.date,
  gameId: pending.gameId,
  stake: result === "hit" ? 1 : (result === "miss" ? data.stake / 2 : data.stake),
  goals,
  result,
  profitChange,
  balanceAfter: data.balance
});

console.log("Updated Mantingale:", player, result, profitChange);
  }
}

//
// ===============================================
// 🔥 Hlavný CRON – TOTO JE TVOJ PÔVODNÝ KÓD + MARTINGAL
// ===============================================
//

export default async function handler(req, res) {
  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const host = req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const base = `${proto}://${host}`;

    let executed = null;

    //
    // 🔵 1) UPDATE (08:00 UTC)
    //
    if (utcHour === 8 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=update`);
      await updateMantingalePlayers();   // <—— MANTINGAL UPDATE
      executed = "update + mantingale";
    }

    //
    // 🔵 2) SCORER (12:00 UTC)
    //
    else if (utcHour === 12 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=scorer`);
      executed = "scorer";
    }

    //
    // 🔵 3) SAVE + pridanie hráča (13:00 UTC)
    //
    else if (utcHour === 13 && utcMinute < 22) {
      const resp = await axios.get(`${base}/api/ai?task=save`);

      const tip = resp.data?.saved;
      if (tip?.player) {
        await addMantingalePlayer(tip.player);  // <—— pridanie hráča
      }

      executed = "save + add-player";
    }

    return res.json({
      ok: true,
      time: now.toISOString(),
      executed: executed || "nothing",
    });

  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
}
