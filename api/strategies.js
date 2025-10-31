// /api/strategies.js
const BET_AMOUNT = 10;
const ODDS = 2.0;

// --- pomocné funkcie ---
function collectSkaters(box) {
  const home = box?.playerByGameStats?.homeTeam || {};
  const away = box?.playerByGameStats?.awayTeam || {};

  const homeSkaters = [
    ...(Array.isArray(home.forwards) ? home.forwards : []),
    ...(Array.isArray(home.defense) ? home.defense : []),
  ];
  const awaySkaters = [
    ...(Array.isArray(away.forwards) ? away.forwards : []),
    ...(Array.isArray(away.defense) ? away.defense : []),
  ];

  return [
    ...homeSkaters.map((p) => ({
      ...p,
      team: home.teamName?.default || "Home",
    })),
    ...awaySkaters.map((p) => ({
      ...p,
      team: away.teamName?.default || "Away",
    })),
  ];
}

function playersWithTwoGoals(box) {
  return collectSkaters(box)
    .filter((p) => Number(p.goals ?? p.stats?.goals ?? 0) >= 2)
    .map((p) => ({
      name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
      goals: Number(p.goals ?? p.stats?.goals ?? 0),
      assists: Number(p.assists ?? p.stats?.assists ?? 0),
      team: p.team || "",
    }));
}

// --- pomocná s pauzou a retry ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function safeFetchBoxscore(id, retries = 2) {
  const url = `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) throw new Error(`Boxscore ${id}: ${resp.status}`);
      return await resp.json();
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`⚠️ Retry ${i + 1}/${retries} pre zápas ${id}`);
      await sleep(400 + Math.random() * 300);
    }
  }
}

// --- limit paralelných fetchov ---
async function runWithLimit(tasks, limit = 10) {
  const results = [];
  const queue = [...tasks];
  const workers = Array(Math.min(limit, queue.length))
    .fill(0)
    .map(async () => {
      while (queue.length) {
        const task = queue.shift();
        const r = await task();
        results.push(r);
      }
    });
  await Promise.all(workers);
  return results;
}

// --- hlavná funkcia ---
export default async function handler(req, res) {
  try {
    const baseUrl = "https://nhlpro.sk";
    const matchesResp = await fetch(`${baseUrl}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) throw new Error(`Nepodarilo sa načítať /api/matches`);
    const matchesData = await matchesResp.json();
    let matches = Array.isArray(matchesData.matches) ? matchesData.matches : [];

    matches = matches
      .filter((m) => m.status === "closed" && m.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    const tasks = matches.map((m) => async () => {
      totalBet += BET_AMOUNT;
      const gameId = m.id;
      let success = false;
      let profitNum = -BET_AMOUNT;

      try {
        const box = await safeFetchBoxscore(gameId);
        const players = playersWithTwoGoals(box);
        if (Array.isArray(players) && players.length > 0) {
          success = true;
          profitNum = BET_AMOUNT * (ODDS - 1);
        }
      } catch (e) {
        console.warn(`⚠️ ${m.date} ${m.home_team} – ${m.away_team}: ${e.message}`);
      }

      totalProfit += profitNum;

      return {
        id: gameId,
        date: m.date,
        home: m.home_team,
        away: m.away_team,
        twoGoals: success ? "✅" : "❌",
        result: success ? "Výhra" : "Prehra",
        profit: Number(profitNum.toFixed(2)),
      };
    });

    const processed = await runWithLimit(tasks, 10);
    processed.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      ok: true,
      totalBet,
      totalProfit: Number(totalProfit.toFixed(2)),
      results: processed,
    });
  } catch (err) {
    console.error("❌ /api/strategies:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
