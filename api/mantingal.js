// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
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

// 🔹 vždy vytvorí platnú URL
function getBaseUrl() {
  return process.env.VERCEL_URL
    ? (process.env.VERCEL_URL.startsWith("http")
        ? process.env.VERCEL_URL
        : `https://${process.env.VERCEL_URL}`)
    : "https://nhlpro.sk";
}

// 🔹 načíta Top 10 hráčov podľa ratingu
async function getTop10Players() {
  const resp = await fetch(`${getBaseUrl()}/api/matches`);
  const data = await resp.json();
  const players = data.playerRatings || {};
  return Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
}

// 🔹 zatiaľ len simulácia výsledku
async function playerScored(name) {
  return Math.random() < 0.2;
}

// ========== HLAVNÉ AKCIE ==========

// 🟢 Stav (GET)
async function getState() {
  const state = await loadState();

  // inicializácia len ak ešte nie sú hráči
  if (!state.players || Object.keys(state.players).length === 0) {
    console.log("⚙️ Inicializujem Mantingal z reálnych playerRatings...");
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
    console.log(`✅ Inicializovaných ${top10.length} hráčov pre Mantingal`);
  }

  return { ok: true, state };
}

// 🔵 Update (10:00)
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;

  for (const [name, p] of Object.entries(players)) {
    if (!p.activeToday) continue;
    const
