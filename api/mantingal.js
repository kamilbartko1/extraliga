// /api/mantingal.js
export default async function handler(req, res) {
  try {
    const BASE_STAKE = 1;
    const FIXED_ODDS = 2.2;

    // === 1️⃣ Získaj včerajší dátum ===
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const YESTERDAY = now.toISOString().slice(0, 10);

    // === 2️⃣ Načítaj hráčov z /api/matches (Top 10 podľa ratingu) ===
    const matchesResp = await fetch("https://nhlpro.sk/api/matches");
    const matchesData = await matchesResp.json();

    const playerRatings = matchesData.playerRatings || {};
    const top10 = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => ({
        name,
        stake: BASE_STAKE,
        profit: 0,
        lastResult: "-",
        streak: 0,
      }));

    // === 3️⃣ Načítaj zápasy zo včerajška ===
    const scoreResp = await fetch(`https://api-web.nhle.com/v1/score/${YESTERDAY}`);
    const scoreData = await scoreResp.json();
    const games = Array.isArray(scoreData.games) ? scoreData.games : [];

    // === 4️⃣ Získaj všetkých strelcov z boxscore dát ===
    const scorers = new Set();

    for (const g of games) {
      if (!g.id) continue;
      try {
        const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
        if (!r.ok) continue;
        const box = await r.json();

        const allPlayers = [
          ...(box?.playerByGameStats?.homeTeam?.forwards || []),
          ...(box?.playerByGameStats?.awayTeam?.forwards || []),
          ...(box?.playerByGameStats?.homeTeam?.defense || []),
          ...(box?.playerByGameStats?.awayTeam?.defense || []),
        ];

        for (const p of allPlayers) {
          if (p.goals && p.goals > 0) {
            const nm = p.name?.default || "";
            if (nm) scorers.add(nm.toLowerCase());
          }
        }
      } catch (err) {
        console.warn("Boxscore error:", err.message);
      }
    }

    // === 5️⃣ Vyhodnoť Mantingal pre top10 hráčov ===
    for (const player of top10) {
      const lower = player.name.toLowerCase();
      const scored = Array.from(scorers).some(s => s.includes(lower) || lower.includes(s));

      if (scored) {
        const win = player.stake * (FIXED_ODDS - 1);
        player.profit += win;
        player.lastResult = "win";
        player.stake = BASE_STAKE;
        player.streak = 0;
      } else {
        player.profit -= player.stake;
        player.lastResult = "loss";
        player.streak += 1;
        player.stake *= 2;
      }
    }

    // === 6️⃣ Pošli výsledky na frontend ===
    res.status(200).json({
      ok: true,
      dateChecked: YESTERDAY,
      totalGames: games.length,
      scorers: scorers.size,
      players: top10,
    });
  } catch (err) {
    console.error("Mantingal chyba:", err);
    res.status(500).json({ error: err.message || "Mantingal error" });
  }
}
