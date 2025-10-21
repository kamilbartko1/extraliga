const BET_AMOUNT = 10;
const ODDS = 1.9;

// pomocná funkcia – skontroluj, či niekto dal 2+ góly
function hasTwoGoals(boxscore) {
  const players = [
    ...(boxscore?.homeTeam?.skaters || []),
    ...(boxscore?.awayTeam?.skaters || []),
  ];
  return players.some(p => (p?.stats?.goals || 0) >= 2);
}

export default async function handler(req, res) {
  try {
    // --- 1. Načítaj odohrané zápasy z /api/matches
    const base =
      process.env.VERCEL_URL && !process.env.VERCEL_URL.startsWith("http")
        ? `https://${process.env.VERCEL_URL}`
        : "https://nhlpro.sk";

    const matchesResp = await fetch(`${base}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) throw new Error("Nepodarilo sa načítať /api/matches");
    const matchesData = await matchesResp.json();
    const matches = matchesData.matches || [];

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    // --- 2. Prejdi všetky zápasy
    for (const m of matches) {
      if (m.status !== "closed") continue; // iba odohrané zápasy
      totalBet += BET_AMOUNT;

      const gameId = m.id;
      let success = false;

      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const resp = await fetch(boxUrl);
        if (!resp.ok) throw new Error("Boxscore nedostupné");
        const box = await resp.json();

        success = hasTwoGoals(box);
      } catch (e) {
        console.warn(`⚠️ Zápas ${gameId}: chyba boxscore (${e.message})`);
      }

      const profit = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
      totalProfit += profit;

      results.push({
        id: gameId,
        date: m.date,
        home: m.home_team,
        away: m.away_team,
        twoGoals: success ? "✅ Áno" : "❌ Nie",
        result: success ? "Výhra" : "Prehra",
        profit: profit.toFixed(2),
      });
    }

    // --- 3. Odošli výsledky
    res.status(200).json({
      ok: true,
      totalBet,
      totalProfit: Number(totalProfit.toFixed(2)),
      results,
    });
  } catch (err) {
    console.error("❌ Chyba /api/strategies:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
