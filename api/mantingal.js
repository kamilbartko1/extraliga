// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH =
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const KV_KEY = "mantingal_state_v1";
const DATA_FILE = path.join(process.cwd(), "data", "mantingal.json");

// ---------- helpers ----------
async function loadState() {
  try {
    if (USE_UPSTASH) {
      const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const j = await r.json();
      const s = j.result ? JSON.parse(j.result) : {};
      return { players: s.players || {}, history: s.history || [] };
    } else {
      const txt = await fs.readFile(DATA_FILE, "utf8");
      const s = JSON.parse(txt);
      return { players: s.players || {}, history: s.history || [] };
    }
  } catch {
    return { players: {}, history: [] };
  }
}

async function saveState(state) {
  try {
    const body = JSON.stringify(state, null, 2);
    if (USE_UPSTASH) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${KV_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } else {
      // Vercel FS je read-only; ak to zlyhá, nevadí – odpoveď už hráčov obsahuje.
      await fs.writeFile(DATA_FILE, body);
    }
  } catch (e) {
    console.warn("saveState warning:", e?.message || e);
  }
}

async function getTop10PlayersFromMatches() {
  // Priamo tvoja produkčná URL s funkčným playerRatings
  const resp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
  if (!resp.ok) throw new Error(`matches fetch failed: ${resp.status}`);
  const data = await resp.json();
  const players = data.playerRatings || {};
  const top10 = Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
  return top10;
}

// dočasná simulácia – neskôr nahradíš boxscore checkom
async function playerScored() {
  return Math.random() < 0.2;
}

// ---------- actions ----------
async function getState() {
  // 1) načítaj existujúci stav
  let state = await loadState();

  // 2) Ak chýbajú hráči → vždy si zober Top10 z ratingu (z tvojho /api/matches)
  if (!state.players || Object.keys(state.players).length === 0) {
    const top10 = await getTop10PlayersFromMatches();

    // Ak by náhodou neboli hráči v matches, vráť prázdno (frontend to ošetrí)
    if (!top10.length) {
      return { ok: true, state: { players: {}, history: [] } };
    }

    // 3) Postav hráčov pre Mantingal
    const players = {};
    for (const name of top10) {
      players[name] = {
        stake: 1,
        profit: 0,
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    }

    // 4) Ulož “best-effort” (ak sa nepodarí, nevadí) a hlavne VRÁŤ ICH V ODPOVEDI
    state = { players, history: [] };
    await saveState(state);
    return { ok: true, state };
  }

  // 5) Ak hráči už sú, normálne ich vráť
  return { ok: true, state };
}

async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;

  for (const [name, p] of Object.entries(players)) {
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

async function doReset() {
  const state = await loadState();
  const top10 = await getTop10PlayersFromMatches();

  // deaktivuj starých
  Object.values(state.players || {}).forEach((p) => (p.activeToday = false));

  // aktivuj nových
  for (const name of top10) {
    if (!state.players) state.players = {};
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

// ---------- handler ----------
export default async function handler(req, res) {
  const action = req.query.action || req.body?.action || "state";
  try {
    if (action === "state") return res.status(200).json(await getState());
    if (action === "update") return res.status(200).json(await doUpdate());
    if (action === "reset") return res.status(200).json(await doReset());
    return res.status(400).json({ error: "Neznáma akcia" });
  } catch (e) {
    console.error("mantingal error:", e);
    return res.status(500).json({ error: e.message || "Mantingal error" });
  }
}
