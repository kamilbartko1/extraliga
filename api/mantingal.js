// /api/mantingal.js
let MEMORY_STATE = { players: {}, history: [] };

function cleanName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

async function loadState() {
  return MEMORY_STATE;
}

async function saveState(state) {
  MEMORY_STATE = state;
}

// === Získa Top10 hráčov z ratingov ===
async function getTop10PlayersFromMatches() {
  const resp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
  const data = await resp.json();
  const players = data.playerRatings || {};
  return Object.entries(players)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name]) => name);
}

// === Načítanie / inicializácia stavu ===
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

// === Aktualizácia na základe reálnych gólov ===
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  const FIXED_ODDS = 2.2;
  let dailyProfit = 0;

  // 1️⃣ Získaj posledné zápasy
  let games = [];
  try {
    const resp = await fetch("https://api-web.nhle.com/v1/score/now");
    if (resp.ok) {
      const data = await resp.json();
      games = data.games || [];
    }
  } catch (e) {
    console.warn("⚠️ Chyba pri načítaní /score/now:", e.message);
  }

  if (!games.length) {
    return { ok: true, message: "Žiadne zápasy na vyhodnotenie", dailyProfit: 0 };
  }

  // 2️⃣ Pre každý zápas načítaj boxscore a vyber strelcov
  const scorers = new Set();

  for (const g of games) {
    if (!g.id) continue;
    try {
      const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
      if (!r.ok) continue;
      const box = await r.json();

      const extract = (team) => [
        ...(team?.forwards || []),
        ...(team?.defense || []),
      ];

      const allPlayers = [
        ...extract(box?.playerByGameStats?.homeTeam),
        ...extract(box?.playerByGameStats?.awayTeam),
      ];

      for (const p of allPlayers) {
        const goals = Number(p.goals || 0);
        if (goals > 0) {
          const name = p.name?.default || "";
          const first = p.firstName?.default || "";
          const last = p.lastName?.default || "";
          const full = name.includes(".") ? name : `${first} ${last}`.trim();
          if (full) scorers.add(cleanName(full));
        }
      }
    } catch (e) {
      console.warn(`⚠️ Chyba boxscore pre zápas ${g.id}:`, e.message);
    }
  }

  console.log("📊 Počet strelcov:", scorers.size, [...scorers].slice(0, 10));

  // 3️⃣ Vyhodnoť top hráčov
  for (const [name, pl] of Object.entries(players)) {
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
      console.log(`✅ ${name} skóroval (+${win.toFixed(2)} €)`);
    } else {
      pl.profit -= pl.stake;
      pl.lastResult = "loss";
      pl.streak += 1;
      dailyProfit -= pl.stake;
      pl.stake *= 2;
      console.log(`❌ ${name} neskóroval (-${pl.stake / 2} €)`);
    }
  }

  // 4️⃣ Ulož históriu
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: +dailyProfit.toFixed(2),
  });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit: +dailyProfit.toFixed(2) };
}

// === Reset (nový deň) ===
async function doReset() {
  const top10 = await getTop10PlayersFromMatches();
  const players = {};
  for (const name of top10) {
    players[name] = { stake: 1, profit: 0, streak: 0, lastResult: "-", activeToday: true };
  }
  const newState = { players, history: [] };
  await saveState(newState);
  return { ok: true, message: "Reset hotový", active: top10 };
}

// === Handler pre Vercel ===
export default async function handler(req, res) {
  const action = req.query.action || req.body?.action || "state";
  try {
    if (action === "state") return res.status(200).json(await getState());
    if (action === "update") return res.status(200).json(await doUpdate());
    if (action === "reset") return res.status(200).json(await doReset());
    res.status(400).json({ error: "Neznáma akcia" });
  } catch (e) {
    console.error("Mantingal error:", e);
    res.status(500).json({ error: e.message });
  }
}
