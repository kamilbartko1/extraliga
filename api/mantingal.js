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

// ---------- rating helper ----------
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

// ---------- actions ----------
async function getState() {
  let state = await loadState();

  if (!state.players || Object.keys(state.players).length === 0) {
    const top10 = await getTop10PlayersFromMatches();

    if (!top10.length) {
      return { ok: true, state: { players: {}, history: [] } };
    }

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

    state = { players, history: [] };
    await saveState(state);
    return { ok: true, state };
  }

  return { ok: true, state };
}

// ---------- UPDATE – reálne výsledky z boxscore ----------
// ---------- UPDATE – reálne výsledky z boxscore ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;
  const FIXED_ODDS = 2.2;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const formatDate = (d) => d.toISOString().slice(0, 10);
  const dates = [formatDate(yesterday), formatDate(now)];

  const recentStats = {};

  // prejdeme všetky zápasy za posledné 2 dni
  for (const day of dates) {
    try {
      const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const games = Array.isArray(data.games) ? data.games : [];

      for (const game of games) {
        if (!["FINAL", "OFF"].includes(String(game.gameState || "").toUpperCase())) continue;

        // každý FINAL zápas má zoznam gólov
        const goals = game.goals || [];
        for (const g of goals) {
          const first = g.firstName?.default || g.firstName || "";
          const last = g.lastName?.default || g.lastName || "";
          const name = `${first} ${last}`.trim();
          const team = g.teamAbbrev || "???";

          if (!name) continue;

          // spočítaj góly hráča
          if (!recentStats[name]) {
            recentStats[name] = { goals: 0, team };
          }
          recentStats[name].goals += 1;
        }
      }
    } catch (err) {
      console.warn(`⚠️ Chyba pri dni ${day}:`, err.message);
    }
  }

  console.log(`📊 Načítaných ${Object.keys(recentStats).length} strelcov`);

  // teraz vyhodnotíme výsledky pre našich top hráčov
  for (const [name, p] of Object.entries(players)) {
    if (!p.activeToday) continue;

    const stats = recentStats[name];
    if (!stats) {
      console.log(`⏸️ ${name} nehral alebo nedal gól – bez zmeny`);
      continue;
    }

    if (stats.goals > 0) {
      const winProfit = p.stake * (FIXED_ODDS - 1);
      p.profit += winProfit;
      p.lastResult = "win";
      p.stake = 1;
      p.streak = 0;
      dailyProfit += winProfit;
      console.log(`✅ ${name} (${stats.team}) dal ${stats.goals} gól(ov) – výhra ${winProfit.toFixed(2)} €`);
    } else {
      p.profit -= p.stake;
      p.lastResult = "loss";
      p.streak = (p.streak || 0) + 1;
      p.stake *= 2;
      dailyProfit -= p.stake;
      console.log(`❌ ${name} (${stats.team}) nevsietil – strata ${p.stake} €`);
    }
  }

  // uložíme históriu
  state.history = state.history || [];
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: Number(dailyProfit.toFixed(2)),
  });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit };
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
