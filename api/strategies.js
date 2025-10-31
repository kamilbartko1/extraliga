// /api/strategies.js
const BET_AMOUNT = 10;
const ODDS = 2.0;

// --- pomocné funkcie ---
function collectSkaters(box) {
  const getPlayers = (team) => {
    if (!team) return [];
    // NHL API niekedy používa rôzne štruktúry
    return (
      team.skaters ||
      team.players ||
      team.forwards ||
      team.defense ||
      []
    );
  };

  const home = box?.playerByGameStats?.homeTeam || {};
  const away = box?.playerByGameStats?.awayTeam || {};

  const homeSkaters = getPlayers(home);
  const awaySkaters = getPlayers(away);

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

// --- paralelný beh s limitom ---
async function runWithLimit(tasks, limit = 10) {
  const queue = [...tasks];
  const results = [];
  let active = 0;

  return new Promise((resolve) => {
    const runNext = async () => {
      if (queue.length === 0 && active === 0) return resolve(results);
      while (active < limit && queue.length) {
        const job = queue.shift();
        active++;
        job()
          .then((r) => results.push(r))
          .catch((e) => results.push({ error: e.message }))
          .finally(() => {
            active--;
            runNext();
          });
      }
    };
    runNext();
  });
}

// --- hlavná funkcia ---
export default async function handler(req, res) {
  try {
    const { id } = req.query;

    // === 1️⃣ DETAIL JEDNÉHO ZÁPASU ===
    if (id) {
      const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`;
      const boxResp = await fetch(boxUrl, { cache: "no-store" });
      if (!boxResp.ok) throw new Error(`Boxscore ${id} nedostupné (${boxResp.status})`);
      const box = await boxResp.json();
      const players = playersWithTwoGoals(box);
      return res.status(200).json({ ok: true, id, players });
    }

    // === 2️⃣ VÝPOČTY PRE VŠETKY ZÁPASY ===
    const baseUrl = "https://nhlpro.sk";
    const matchesResp = await fetch(`${baseUrl}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) throw new Error(`Nepodarilo sa načítať /api/matches`);
    const matchesData = await matchesResp.json();
    let matches = Array.isArray(matchesData.matches) ? matchesData.matches : [];

    // zoradenie podľa dátumu
    matches = matches
      .filter((m) => m.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    const tasks = matches
      .filter((m) => m.status === "closed")
      .map((m) => async () => {
        totalBet += BET_AMOUNT;
        const gameId = m.id;
        let success = false;
        let profitNum = 0;

        try {
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
          const boxResp = await fetch(boxUrl, { cache: "no-store" });
          if (!boxResp.ok) throw new Error(`Boxscore ${gameId} nedostupné`);
          const box = await boxResp.json();

          const players = playersWithTwoGoals(box);
          success = Array.isArray(players) && players.length > 0;
          profitNum = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
        } catch (e) {
          console.warn(`⚠️ Zápas ${gameId}: ${e.message}`);
          profitNum = -BET_AMOUNT;
          success = false;
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

    console.log(`🏁 Načítavam ${tasks.length} zápasov (limit 10 naraz)...`);
    const resultsRaw = await runWithLimit(tasks, 10);
    results.push(...resultsRaw.filter((r) => !r?.error));

    // zoradenie podľa dátumu
    results.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log(`🏒 Dokončené ${results.length}/${matches.length} zápasov`);

    res.status(200).json({
      ok: true,
      totalBet,
      totalProfit: Number(totalProfit.toFixed(2)),
      results,
    });
  } catch (err) {
    console.error("❌ /api/strategies:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
