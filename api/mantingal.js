// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH =
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const KV_KEY = "mantingal_state_v1";
const DATA_FILE = path.join(process.cwd(), "data", "mantingal.json");

// ========== Pomocné funkcie ==========

async function loadState() {
  try {
    if (USE_UPSTASH) {
      const res = await fetch(
        `${process.env.UPSTASH_REDIS_REST_URL}/get/${KV_KEY}`,
        { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
      );
      const data = await res.json();
      return data.result ? JSON.parse(data.result) : { players: {}, history: [] };
    } else {
      const file = await fs.readFile(DATA_FILE, "utf8");
      return JSON.parse(file);
    }
  } catch {
    return { players: {}, history: [] };
  }
}

async function saveState(state) {
  const json = JSON.stringify(state, null, 2);
  if (USE_UPSTASH) {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${KV_KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: json,
    });
  } else {
    await fs.writeFile(DATA_FILE, json);
  }
}

function getBaseUrl() {
  return process.env.VERCEL_URL
    ? process.env.VERCEL_URL.startsWith("http")
      ? process.env.VERCEL_URL
      : `https://${process.env.VERCEL_URL}`
    : "https://nhlpro.sk";
}

async function getTop10Players() {
  const resp = await fetch(`${getBaseUrl()}/api/matches`);
  const data = await resp.json();
  const players = data.playerRatings || {};
  const top10 = Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);

  console.log("🎯 Top 10 hráčov:", top10);
  return top10;
}

// 🔹 simulácia výsledku (dočasne)
async function playerScored(name) {
  return Math.random() < 0.2;
}

// ========== HLAVNÉ AKCIE ==========

// 🟢 Stav (GET)
async function getState() {
  const state = await loadState();

  if (!state.players || Object.keys(state.players).length === 0) {
    console.log("⚙️ Prvá inicializácia Mantingalu...");
    const top10 = await getTop10Players();

    state.players = {};
    for (const name of top10) {
      state.players[name] = {
        stake: 1,
        profit: 0,
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    }

    await saveState(state);
    console.log(`✅ Inicializovaných ${top10.length} hráčov`);
  }

  return { ok: true, state };
}

// 🔵 Update (10:00)
async function doUpdate() {
  const state = await loadState();
  let dailyProfit = 0;

  for (const [name, p] of Object.entries(state.players || {})) {
    if (!p.activeToday) continue;
    const scored = await playerScored(name);

    if (scored) {
      const win = p.stake * 1.2;
      p.profit += win;
      p.lastResult = "win";
      p.stake = 1;
      p.streak = 0;
      dailyProfit += win;
    } else {
      p.profit -= p.stake;
      p.lastResult = "loss";
      p.streak = (p.streak || 0) + 1;
      p.stake *= 2;
      dailyProfit -= p.stake;
    }
  }

  state.history = state.history || [];
  state.history.push({ date: new Date().toISOString().slice(0, 10), profit: dailyProfit });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit };
}

// 🟣 Reset (12:00)
async function doReset() {
  const state = await loadState();
  const top10 = await getTop10Players();

  // všetkých deaktivuj
  Object.values(state.players).forEach((p) => (p.activeToday = false));

  for (const name of top10) {
    if (!state.players[name]) {
      state.players[name] = {
        stake: 1,
        profit: 0,
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    } else {
      const p = state.players[name];
      p.activeToday = true;
      if (p.lastResult === "win") p.stake = 1;
    }
  }

  await saveState(state);
  return { ok: true, message: "Reset hotový", active: top10 };
}

// ========== HANDLER ==========
export default async function handler(req, res) {
  const action = req.query.action || req.body?.action || "state";
  try {
    if (action === "state") return res.status(200).json(await getState());
    if (action === "update") return res.status(200).json(await doUpdate());
    if (action === "reset") return res.status(200).json(await doReset());
    return res.status(400).json({ error: "Neznáma akcia" });
  } catch (err) {
    console.error("❌ Mantingal chyba:", err);
    return res.status(500).json({ error: err.message });
  }
}
