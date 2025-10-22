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
      await fs.writeFile(DATA_FILE, body);
    }
  } catch (e) {
    console.warn("saveState warning:", e?.message || e);
  }
}

// ---------- name normalization ----------
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // bez diakritiky
}

function matchesName(player, scorer) {
  const p = normalizeName(player);
  const s = normalizeName(scorer);

  if (p === s) return true;

  // Ak je hráč vo formáte JHughes, vezmi len priezvisko
  const pLast = p.replace(/^[a-z]\s*/, "");
  if (s.includes(pLast) || pLast.includes(s)) return true;

  // Ak je J.Hughes vs JackHughes
  const pInitial = p[0];
  if (s.includes(pInitial) && s.includes(pLast)) return true;

  return false;
}

// ---------- getTop10 ----------
async function getTop10PlayersFromMatches() {
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

// ---------- STATE ----------
async function getState() {
  let state = await loadState();

  if (!state.players || Object.keys(state.players).length === 0) {
    const top10 = await getTop10PlayersFromMatches();
    const players = {};
    for (const name of top10) {
      players[name] = {
        stake: 1,
        profit: 0,
        lastResult: "-",
        streak: 0,
        activeToday: true,
      };
    }
    state = { players, history: [] };
    await saveState(state);
  }

  return { ok: true, state };
}

// ---------- UPDATE – kontrola gólov cez BOXCORE ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;
  const FIXED_ODDS = 2.2;

  // dátumy: dnes a včera
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const format = (d) => d.toISOString().slice(0, 10);
  const dates = [format(yesterday), format(now)];
  const allGames = [];

  // načítaj zápasy
  for (const day of dates) {
    try {
      const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data.games)) {
        const finals = data.games.filter((g) =>
          ["FINAL", "OFF"].includes(String(g.gameState || "").toUpperCase())
        );
        allGames.push(...finals);
      }
    } catch (e) {
      console.warn(`⚠️ Chyba pri zápasoch pre ${day}:`, e.message);
    }
  }

  console.log(`📅 Načítaných ${allGames.length} zápasov`);

  // načítaj strelcov z boxscore
  const scorers = new Set();
  for (const g of allGames) {
    try {
      const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
      if (!r.ok) continue;
      const box = await r.json();

      const extractPlayers = (team) => [
        ...(team?.forwards || []),
        ...(team?.defense || []),
      ];

      const all = [
        ...extractPlayers(box?.playerByGameStats?.homeTeam),
        ...extractPlayers(box?.playerByGameStats?.awayTeam),
      ];

      for (const p of all) {
        const goals = Number(p.goals || 0);
        if (goals > 0) {
          const fullName = `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim();
          if (fullName) scorers.add(fullName);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Chyba pri boxscore zápasu ${g.id}:`, err.message);
    }
  }

  console.log(`📊 Nájdených ${scorers.size} strelcov`);

  // vyhodnotenie
  for (const [name, p] of Object.entries(players)) {
    if (!p.activeToday) continue;
    const scored = Array.from(scorers).some((s) => matchesName(name, s));

    if (scored) {
      const winProfit = +(p.stake * (FIXED_ODDS - 1)).toFixed(2);
      p.profit = +(p.profit + winProfit).toFixed(2);
      p.lastResult = "win";
      p.stake = 1;
      p.streak = 0;
      dailyProfit += winProfit;
      console.log(`✅ ${name} skóroval (+${winProfit} €)`);
    } else {
      const loss = p.stake;
      p.profit = +(p.profit - loss).toFixed(2);
      p.lastResult = "loss";
      p.streak++;
      p.stake *= 2;
      dailyProfit -= loss;
      console.log(`❌ ${name} neskóroval (-${loss} €)`);
    }
  }

  state.history = state.history || [];
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: +dailyProfit.toFixed(2),
  });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit: +dailyProfit.toFixed(2) };
}

// ---------- RESET ----------
async function doReset() {
  const state = await loadState();
  const top10 = await getTop10PlayersFromMatches();
  Object.values(state.players || {}).forEach((p) => (p.activeToday = false));

  for (const name of top10) {
    if (!state.players) state.players = {};
    if (!state.players[name]) {
      state.players[name] = {
        stake: 1,
        profit: 0,
        lastResult: "-",
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
