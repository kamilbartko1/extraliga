// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
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

// ---------- name helpers ----------
function cleanName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

// ---------- getTop10 ----------
async function getTop10PlayersFromMatches() {
  const resp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
  if (!resp.ok) throw new Error(`matches fetch failed: ${resp.status}`);
  const data = await resp.json();
  const players = data.playerRatings || {};
  return Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
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
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    }
    state = { players, history: [] };
    await saveState(state);
  }
  return { ok: true, state };
}

// ---------- UPDATE ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  const FIXED_ODDS = 2.2;
  let dailyProfit = 0;

  // 🏒 1) Fetch current or recent games
  let games = [];
  try {
    const nowResp = await fetch("https://api-web.nhle.com/v1/score/now");
    if (nowResp.ok) {
      const nowData = await nowResp.json();
      if (Array.isArray(nowData.games)) games = nowData.games;
    }
  } catch (e) {
    console.warn("⚠️ score/now failed:", e.message);
  }

  // fallback – posledné 2 dni
  if (!games.length) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    for (const d of [yesterday, now]) {
      const day = d.toISOString().slice(0, 10);
      try {
        const r = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (r.ok) {
          const dd = await r.json();
          if (Array.isArray(dd.games)) games.push(...dd.games);
        }
      } catch {}
    }
  }

  console.log(`📅 Načítaných zápasov: ${games.length}`);

  // 🥅 2) Získať strelcov z boxscore
  const scorers = new Set();

  for (const g of games) {
    if (!g.id) continue;
    try {
      const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
      if (!r.ok) continue;
      const box = await r.json();

      const allPlayers = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];

      for (const p of allPlayers) {
        if (p.goals && p.goals > 0) {
          const nm = p.name?.default || "";
          if (nm) scorers.add(cleanName(nm));
        }
      }
    } catch (err) {
      console.warn(`⚠️ Boxscore ${g.id} chyba:`, err.message);
    }
  }

  console.log(`📊 Počet strelcov: ${scorers.size}`);

  // 🎯 3) Vyhodnotenie Mantingalu
  for (const [name, pl] of Object.entries(players)) {
    if (!pl.activeToday) continue;
    const clean = cleanName(name);
    const scored = Array.from(scorers).some((s) => s.includes(clean) || clean.includes(s));

    if (scored) {
      const win = pl.stake * (FIXED_ODDS - 1);
      pl.profit += win;
      pl.lastResult = "win";
      pl.stake = 1;
      pl.streak = 0;
      dailyProfit += win;
      console.log(`✅ ${name} skóroval +${win.toFixed(2)} €`);
    } else {
      pl.profit -= pl.stake;
      pl.lastResult = "loss";
      pl.streak += 1;
      dailyProfit -= pl.stake;
      pl.stake *= 2;
      console.log(`❌ ${name} neskóroval -${pl.stake / 2} €`);
    }
  }

  // 💾 4) Uložiť históriu
  state.history = state.history || [];
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: Number(dailyProfit.toFixed(2)),
  });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit: Number(dailyProfit.toFixed(2)) };
}

// ---------- RESET ----------
async function doReset() {
  const state = await loadState();
  const top10 = await getTop10PlayersFromMatches();
  Object.values(state.players || {}).forEach((p) => (p.activeToday = false));

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
      state.players[name].activeToday = true;
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
