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

const M_PLAYERS = "MANTINGAL_PLAYERS"; 
// História hráčov: "MANTINGAL_HISTORY:<player>"

// Bezpečné parsovanie Upstash hodnoty (string alebo { value: string })
function safeParse(raw) {
  try {
    if (raw && typeof raw === "object" && raw.value) {
      return JSON.parse(raw.value);
    }
    if (typeof raw === "string") {
      return JSON.parse(raw);
    }
    return {};
  } catch {
    return {};
  }
}

// Garantujeme základnú štruktúru hráča
function normalizeState(obj, startedDate = null) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    started: obj.started || startedDate,
    lastUpdate: obj.lastUpdate || null,
  };
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
      const full = `${p.firstName?.default} ${p.lastName?.default}`.toLowerCase();       // "Jason Robertson"
      const short = `${p.firstName?.default?.[0]}. ${p.lastName?.default}`.toLowerCase(); // "J. Robertson"
      return full === normalized || short === normalized;
    });

    // ❗ Ak hráč vôbec nie je v zozname → NEHRAL
    if (!found) return null;

    return Number(found.goals || 0);
  } catch (err) {
    console.warn("Boxscore error:", err.message);
    // Ak boxscore nedostupný → radšej SKIP
    return null;
  }
}

// Zápis do histórie jedného hráča
async function appendHistory(player, entry) {
  const key = `MANTINGAL_HISTORY:${player}`;
  let histRaw = await redis.get(key);
  let hist = [];

  if (histRaw) {
    try {
      hist = typeof histRaw === "string" ? JSON.parse(histRaw) : safeParse(histRaw);
      if (!Array.isArray(hist)) hist = [];
    } catch {
      hist = [];
    }
  }

  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}

// 🔥 Hlavná logika: prechádza VŠETKY AI tipy a spraví Martingale pre každého hráča
async function updateMantingalePlayers() {
  // 1️⃣ Načítame existujúci stav hráčov (MANTINGAL_PLAYERS)
  const playersHash = (await redis.hgetall(M_PLAYERS)) || {};
  const states = {};

  for (const [name, raw] of Object.entries(playersHash)) {
    const parsed = safeParse(raw);
    states[name] = normalizeState(parsed);
  }

  // 2️⃣ Načítame všetky AI tipy (AI_TIPS_HISTORY)
  const tipsHash = await redis.hgetall("AI_TIPS_HISTORY");
  if (!tipsHash) return;

  const tipsList = Object.values(tipsHash)
    .map((raw) => safeParse(raw))
    .filter((t) => t && t.player && t.gameId && t.date)
    .sort((a, b) => a.date.localeCompare(b.date)); // chronologicky

  // 3️⃣ Pre každý tip (hráč + dátum) spravíme Martingale krok
  for (const tip of tipsList) {
    const name = tip.player; // krátke meno "J. Robertson", "S. Reinhart"
    if (!name) continue;

    // Ak hráč ešte nie je v MANTINGAL_PLAYERS → vytvoríme základný stav
    if (!states[name]) {
      states[name] = normalizeState({}, tip.date);

      // Pripravíme prázdnu históriu, ak ešte neexistuje
      const key = `MANTINGAL_HISTORY:${name}`;
      const existingHist = await redis.get(key);
      if (!existingHist) {
        await redis.set(key, JSON.stringify([]));
      }
    }

    const state = states[name];

    // Už sme tento dátum pre tohto hráča vyhodnotili → preskoč
    if (state.lastUpdate === tip.date) continue;

    // Gól(y) z boxscore – rozlišuje HRAL / NEHRAL
    const goals = await getGoals(tip.gameId, name);

    let result = "";
    let profitChange = 0;
    const usedStake = state.stake; // suma, ktorú sme vsadili v daný deň

    // --------------------------------------
    // SKIP – hráč NEHRAL
    // --------------------------------------
    if (goals === null) {
      result = "skip";
      // stake, streak, balance zostávajú rovnaké
    }

    // --------------------------------------
    // HIT – hráč dal aspoň 1 gól
    // --------------------------------------
    else if (goals > 0) {
      result = "hit";
      profitChange = Number((usedStake * 1.2).toFixed(2)); // kurz 2.2 → zisk 1.2 * stake
      state.balance = Number((state.balance + profitChange).toFixed(2));
      state.stake = 1;
      state.streak = 0;
    }

    // --------------------------------------
    // MISS – hráč hral, ale nedal gól
    // --------------------------------------
    else if (goals === 0) {
      result = "miss";
      profitChange = -usedStake;
      state.balance = Number((state.balance + profitChange).toFixed(2));
      state.streak += 1;
      state.stake = usedStake * 2; // zdvojnásobenie na ďalší zápas
    }

    state.lastUpdate = tip.date;

    // Zapíšeme históriu jedného kroku
    await appendHistory(name, {
      date: tip.date,
      gameId: tip.gameId,
      stake: usedStake,
      goals,
      result,
      profitChange,
      balanceAfter: state.balance,
    });

    console.log("Mantingale update:", name, tip.date, result, profitChange);
  }

  // 4️⃣ Zapíšeme všetky stavy späť do MANTINGAL_PLAYERS
  const toStore = {};
  for (const [name, state] of Object.entries(states)) {
    toStore[name] = JSON.stringify(state);
  }
  if (Object.keys(toStore).length > 0) {
    await redis.hset(M_PLAYERS, toStore);
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

    const host = req.headers.host;
    const proto = req.headers["x-forwarded-proto"] || "https";
    const base = `${proto}://${host}`;

    let executed = null;

    //
    // 🔵 1) UPDATE (09:00 CET → 08:00 UTC)
    //    - vyhodnotí AI_TIPS_HISTORY (ai.js ?task=update)
    //    - vyhodnotí MANTINGAL podľa tých istých zápasov
    //
    if (utcHour === 8 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=update`);
      await updateMantingalePlayers();   // <—— MANTINGAL UPDATE
      executed = "update + mantingale";
    }

    //
    // 🔵 2) SCORER (14:00 CET → 13:00 UTC alebo ako máš nastavené)
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
      // hráč sa uloží priamo v ai.js (MANTINGAL_PLAYERS + AI_TIPS_HISTORY)
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
