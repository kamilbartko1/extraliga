// /api/mantingal.js
let MEMORY_STATE = { players: {}, history: [] };

// ---------- helpers ----------
function cleanName(str) {
  return String(str || "").replace(/[\s.]/g, "").toLowerCase();
}

async function loadState() {
  return MEMORY_STATE;
}

async function saveState(state) {
  MEMORY_STATE = state;
}

// ---------- getTop10 ----------
async function getTop10PlayersFromMatches() {
  const resp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
  const data = await resp.json();
  const players = data.playerRatings || {};
  return Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
}

// ---------- STATE ----------
async function getState() {
  const state = await loadState();
  if (!state.players || Object.keys(state.players).length === 0) {
    const top10 = await getTop10PlayersFromMatches();
    const players = {};
    for (const name of top10) {
      players[name] = { stake: 1, profit: 0, streak: 0, lastResult: "-", activeToday: true };
    }
    const newState = { players, history: [] };
    await saveState(newState);
    return { ok: true, state: newState };
  }
  return { ok: true, state };
}

// ---------- UPDATE ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  const FIXED_ODDS = 2.2;
  let dailyProfit = 0;

  // 1️⃣ Získaj zápasy z posledného dňa
  let games = [];
  try {
    const r = await fetch("https://api-web.nhle.com/v1/score/now");
    if (r.ok) {
      const j = await r.json();
      games = j.games || [];
    }
  } catch (e) {
    console.warn("⚠️ /score/now chyba:", e.message);
  }

  // 2️⃣ Pre každý zápas zober strelcov z boxscore
  const scorers = new Set();
  for (const g of games) {
    try {
      const box = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`).then(r => r.json());
      const all = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];
      for (const p of all) {
        if (p.goals && p.goals > 0) {
          const nm = p.name?.default || "";
          if (nm) scorers.add(cleanName(nm));
        }
      }
    } catch (e) {
      console.warn(`⚠️ Chyba boxscore ${g.id}:`, e.message);
    }
  }

  console.log(`📊 Počet strelcov: ${scorers.size}`);

  // 3️⃣ Vyhodnotenie Mantingalu
  for (const [name, pl] of Object.entries(players)) {
    if (!pl.activeToday) continue;
    const clean = cleanName(name);
    const scored = Array.from(scorers).some(
      (s) => s.includes(clean) || clean.includes(s)
    );

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
      pl.streak++;
      dailyProfit -= pl.stake;
      pl.stake *= 2;
      console.log(`❌ ${name} neskóroval -${pl.stake / 2} €`);
    }
  }

  // 4️⃣ Uloženie do pamäte
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: +dailyProfit.toFixed(2),
  });
  await saveState(state);

  return { ok: true, message: "Update hotový", dailyProfit: +dailyProfit.toFixed(2) };
}

// ---------- RESET ----------
async function doReset() {
  const top10 = await getTop10PlayersFromMatches();
  const players = {};
  for (const name of top10) {
    players[name] = { stake: 1, profit: 0, streak: 0, lastResult: "-", activeToday: true };
  }
  const state = { players, history: [] };
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
    res.status(400).json({ error: "Neznáma akcia" });
  } catch (e) {
    console.error("mantingal error:", e);
    res.status(500).json({ error: e.message || "Mantingal error" });
  }
}
