// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const KV_KEY = "mantingal_state_v1";
const DATA_FILE = path.join(process.cwd(), "data", "mantingal.json");

async function loadState() {
  try {
    if (USE_UPSTASH) {
      const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const j = await r.json();
      return j.result ? JSON.parse(j.result) : { players: {}, history: [] };
    } else {
      const data = await fs.readFile(DATA_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch {
    return { players: {}, history: [] };
  }
}

async function saveState(state) {
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
    await fs.writeFile(DATA_FILE, body);
  }
}

function cleanName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

// ---------- načítaj top hráčov ----------
async function getTop10PlayersFromMatches() {
  const resp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
  const data = await resp.json();
  const players = data.playerRatings || {};
  return Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n]) => n);
}

// ---------- získať aktuálny dátum a zápasy ----------
async function getLatestFinishedGames() {
  const resp = await fetch("https://api-web.nhle.com/v1/score/now");
  const nowData = await resp.json();
  const games = nowData.games || [];
  return games
    .filter((g) => ["FINAL", "OFF"].includes((g.gameState || "").toUpperCase()))
    .map((g) => g.id);
}

// ---------- získať strelcov ----------
async function getScorersFromGames(gameIds) {
  const scorers = new Set();

  for (const id of gameIds) {
    try {
      const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`);
      if (!r.ok) continue;
      const box = await r.json();

      const players = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];

      for (const p of players) {
        if (p.goals && p.goals > 0) {
          const full =
            p.name?.default ||
            `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim();
          if (full) scorers.add(cleanName(full));
        }
      }
    } catch (err) {
      console.warn("Boxscore fetch error", id, err.message);
    }
  }

  console.log("📊 Počet strelcov:", scorers.size);
  return scorers;
}

// ---------- hlavná aktualizácia ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  const FIXED_ODDS = 2.2;
  let dailyProfit = 0;

  const gameIds = await getLatestFinishedGames();
  console.log("🎮 Game IDs:", gameIds);
  if (!gameIds.length) return { ok: true, message: "Žiadne ukončené zápasy", dailyProfit: 0 };

  const scorers = await getScorersFromGames(gameIds);

  for (const [name, pl] of Object.entries(players)) {
    if (!pl.activeToday) continue;
    const clean = cleanName(name);
    const scored = Array.from(scorers).some((s) => s.includes(clean) || clean.includes(s));

    if (scored) {
      const win = +(pl.stake * (FIXED_ODDS - 1)).toFixed(2);
      pl.profit = +(pl.profit + win).toFixed(2);
      pl.lastResult = "win";
      pl.stake = 1;
      pl.streak = 0;
      dailyProfit += win;
      console.log(`✅ ${name} skóroval +${win} €`);
    } else {
      const loss = pl.stake;
      pl.profit = +(pl.profit - loss).toFixed(2);
      pl.lastResult = "loss";
      pl.streak += 1;
      pl.stake *= 2;
      dailyProfit -= loss;
      console.log(`❌ ${name} neskóroval -${loss} €`);
    }
  }

  state.history = state.history || [];
  state.history.push({ date: new Date().toISOString().slice(0, 10), profit: dailyProfit });
  await saveState(state);

  return { ok: true, message: "Update hotový", dailyProfit };
}

// ---------- reset ----------
async function doReset() {
  const top10 = await getTop10PlayersFromMatches();
  const players = {};
  for (const name of top10) {
    players[name] = { stake: 1, profit: 0, lastResult: null, streak: 0, activeToday: true };
  }
  const state = { players, history: [] };
  await saveState(state);
  return { ok: true, message: "Reset hotový", players };
}

// ---------- handler ----------
export default async function handler(req, res) {
  const action = req.query.action || req.body?.action || "state";
  try {
    if (action === "state") {
      const s = await loadState();
      return res.status(200).json({ ok: true, state: s });
    }
    if (action === "update") return res.status(200).json(await doUpdate());
    if (action === "reset") return res.status(200).json(await doReset());
    return res.status(400).json({ error: "Neznáma akcia" });
  } catch (e) {
    console.error("Mantingal chyba:", e);
    res.status(500).json({ error: e.message });
  }
}
