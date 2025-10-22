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

// ---------- name helpers ----------
function cleanName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

function parseNameVariants(name) {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0]?.replace(/\./g, "") || "";
  const last = parts.slice(1).join(" ") || "";
  const variants = new Set();
  if (first && last) {
    variants.add(cleanName(`${first} ${last}`));
    variants.add(cleanName(`${first[0]} ${last}`));
    variants.add(cleanName(`${first[0]}.${last}`));
  }
  variants.add(cleanName(name));
  return { first, last, variants: Array.from(variants) };
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

// ---------- UPDATE – reálne výsledky z gólov (používa /score/now) ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;
  const FIXED_ODDS = 2.2;

  const baseUrl = "https://api-web.nhle.com/v1/score";
  let dates = [];

  try {
    // načítaj meta-info s aktuálnym dňom a predchádzajúcim
    const nowResp = await fetch(`${baseUrl}/now`);
    if (nowResp.ok) {
      const nowData = await nowResp.json();
      if (nowData?.prevDate && nowData?.currentDate) {
        dates = [nowData.prevDate, nowData.currentDate];
      }
    }
  } catch (e) {
    console.warn("⚠️ Nepodarilo sa načítať /score/now:", e.message);
  }

  // fallback ak by nevrátilo dátumy
  if (!dates.length) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    dates = [fmt(yesterday), fmt(now)];
  }

  // 🔹 Načítaj zápasy pre tieto dátumy
  let games = [];
  for (const d of dates) {
    try {
      const resp = await fetch(`${baseUrl}/${d}`);
      if (!resp.ok) continue;
      const json = await resp.json();
      if (Array.isArray(json.games)) {
        games.push(...json.games);
      }
    } catch (err) {
      console.warn(`⚠️ Chyba pri fetchnutí zápasov pre ${d}:`, err.message);
    }
  }

  console.log(`📅 Načítaných ${games.length} zápasov z ${dates.join(", ")}`);

  // 🔹 Zhromaždi všetkých strelcov (z poľa "goals")
  const scorers = [];
  for (const g of games) {
    if (!["FINAL", "OFF"].includes(String(g.gameState || "").toUpperCase()))
      continue;

    for (const goal of g.goals || []) {
      const first = goal.firstName?.default || "";
      const last = goal.lastName?.default || "";
      const team = goal.teamAbbrev || "";
      if (!first && !last) continue;
      const full = `${first} ${last}`.trim();
      scorers.push({
        clean: full.replace(/[\s.]/g, "").toLowerCase(),
        display: full,
        team,
      });
    }
  }

  // 🔹 Odstráň duplicity
  const scorerSet = new Map();
  for (const s of scorers) {
    if (!s || !s.clean) continue;
    scorerSet.set(s.clean, s);
  }

  console.log(`📊 Nájdených unikátnych strelcov: ${scorerSet.size}`);

  // 🔹 Pomocná funkcia pre kontrolu mena
  function playerScored(playerName) {
    const clean = playerName.replace(/[\s.]/g, "").toLowerCase();
    return Array.from(scorerSet.keys()).some((s) => s.includes(clean) || clean.includes(s));
  }

  // 🔹 Vyhodnotenie Mantingalu
  for (const [name, p] of Object.entries(players)) {
    if (!p.activeToday) continue;

    const scored = playerScored(name);
    if (scored) {
      const winProfit = Number((p.stake * (FIXED_ODDS - 1)).toFixed(2));
      p.profit = Number((Number(p.profit || 0) + winProfit).toFixed(2));
      p.lastResult = "win";
      p.stake = 1;
      p.streak = 0;
      dailyProfit += winProfit;
      console.log(`✅ ${name} skóroval (+${winProfit.toFixed(2)} €)`);
    } else {
      const lossAmount = Number(p.stake || 0);
      p.profit = Number((Number(p.profit || 0) - lossAmount).toFixed(2));
      p.lastResult = "loss";
      p.streak = (p.streak || 0) + 1;
      p.stake = Number((p.stake || 1) * 2);
      dailyProfit -= lossAmount;
      console.log(`❌ ${name} neskóroval (−${lossAmount.toFixed(2)} €), nový stake: ${p.stake}`);
    }
  }

  // 🔹 Ulož históriu
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
