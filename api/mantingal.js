// /api/mantingal.js – Mantingal s rozlíšením: win / loss / skip

export default async function handler(req, res) {
  try {
    const FIXED_ODDS = 2.2;
    const BASE_STAKE = 1;

    // === 1️⃣ Získaj top10 hráčov z /api/matches
    const matchesResp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
    if (!matchesResp.ok) throw new Error("Nepodarilo sa načítať zápasy");
    const matchesData = await matchesResp.json();
    const playerRatings = matchesData.playerRatings || {};

    const top10 = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => ({
        name,
        stake: BASE_STAKE,
        profit: 0,
        streak: 0,
        lastResult: "-",
      }));

    // === 2️⃣ Zisti včerajší dátum
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    // === 3️⃣ Načítaj zápasy z včerajška
    const scoreResp = await fetch(`https://api-web.nhle.com/v1/score/${dateStr}`);
    if (!scoreResp.ok) throw new Error("Nepodarilo sa načítať včerajšie zápasy");
    const scoreData = await scoreResp.json();
    const games = Array.isArray(scoreData.games) ? scoreData.games : [];

    // === 4️⃣ Získaj všetkých hráčov a strelcov z boxscore
    const scorers = new Set();
    const playedPlayers = new Set();

    for (const g of games) {
      if (!g.id) continue;
      try {
        const boxResp = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
        if (!boxResp.ok) continue;
        const box = await boxResp.json();

        const players = [
          ...(box?.playerByGameStats?.homeTeam?.forwards || []),
          ...(box?.playerByGameStats?.homeTeam?.defense || []),
          ...(box?.playerByGameStats?.awayTeam?.forwards || []),
          ...(box?.playerByGameStats?.awayTeam?.defense || []),
        ];

        for (const p of players) {
          const nm = String(p.name?.default || "").toLowerCase().trim();
          if (!nm) continue;
          playedPlayers.add(nm); // hráč, ktorý nastúpil
          if (p.goals && p.goals > 0) scorers.add(nm); // skóroval
        }
      } catch (err) {
        console.warn(`Boxscore chyba ${g.id}:`, err.message);
      }
    }

    // === 5️⃣ Vyhodnoť Mantingal logiku
    let totalProfit = 0;

    for (const player of top10) {
      const clean = player.name.toLowerCase();

      const played = Array.from(playedPlayers).some(
        (p) => p.includes(clean) || clean.includes(p)
      );

      const scored = Array.from(scorers).some(
        (s) => s.includes(clean) || clean.includes(s)
      );

      if (!played) {
        // 🟦 Hráč nehral
        player.lastResult = "skip";
        player.stake = BASE_STAKE;
        console.log(`⏸️ ${player.name} nehral – bez zmeny`);
        continue;
      }

      if (scored) {
        const win = player.stake * (FIXED_ODDS - 1);
        player.profit += win;
        player.lastResult = "win";
        player.stake = BASE_STAKE;
        totalProfit += win;
        console.log(`✅ ${player.name} skóroval +${win.toFixed(2)} €`);
      } else {
        player.profit -= player.stake;
        totalProfit -= player.stake;
        player.lastResult = "loss";
        player.stake *= 2;
        console.log(`❌ ${player.name} hral, ale neskóroval – nový stake ${player.stake} €`);
      }
    }

    // === 6️⃣ Výsledná odpoveď
    return res.status(200).json({
      ok: true,
      dateChecked: dateStr,
      totalGames: games.length,
      scorers: scorers.size,
      players: top10,
      totalProfit: totalProfit.toFixed(2),
    });
  } catch (err) {
    console.error("Mantingal chyba:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

    // obmedzenie paralelných volaní
    const CONCURRENCY = 6;
    const runWithLimit = async (jobs, limit) => {
      const queue = jobs.slice();
      const workers = Array(Math.min(limit, queue.length))
        .fill(0)
        .map(async () => {
          while (queue.length) {
            const job = queue.shift();
            await job();
          }
        });
      await Promise.all(workers);
    };
    await runWithLimit(boxscoreJobs, CONCURRENCY);
