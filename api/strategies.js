// /api/strategies.js
const BET_AMOUNT = 10; // na každý zápas vsadíme 10 €
const ODDS = 1.9; // kurz 1.9

// Pomocná funkcia – skontroluje, či niekto dal 2+ góly
function hasTwoGoals(boxscore) {
  const players = [
    ...(boxscore?.homeTeam?.skaters || []),
    ...(boxscore?.awayTeam?.skaters || []),
  ];
  return players.some((p) => (p?.stats?.goals || 0) >= 2);
}

export default async function handler(req, res) {
  try {
    // 🔹 1. Načítaj všetky odohrané zápasy z tvojho backendu
    const baseUrl = "https://nhlpro.sk"; // priamo tvoja doména (spoľahlivé riešenie)
    console.log("🔗 Fetchujem zápasy z:", `${baseUrl}/api/matches`);

    const matchesResp = await fetch(`${baseUrl}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) {
      throw new Error(`Nepodarilo sa načítať zápasy (${matchesResp.status})`);
    }

    const matchesData = await matchesResp.json();
    const matches = matchesData.matches || [];

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    // 🔹 2. Prejdi všetky odohrané zápasy
    for (const m of matches) {
      if (m.status !== "closed") continue; // iba odohrané zápasy

      const gameId = m.id;
      let success = false;

      try {
        // Načítaj boxscore pre každý zápas
        const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const boxResp = await fetch(url);
        if (!boxResp.ok) throw new Error(`Boxscore ${gameId} nedostupné`);
        const boxData = await boxResp.json();

        // Skontroluj, či niekto dal aspoň 2 góly
        success = hasTwoGoals(boxData);
      } catch (err) {
        console.warn(`⚠️ Zápas ${gameId}: ${err.message}`);
      }

      // 🔹 3. Výpočet zisku
      totalBet += BET_AMOUNT;
      const profit = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
      totalProfit += profit;

      // 🔹 4. Ulož výsledok pre tabuľku
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

    // 🔹 5. Vráť sumár aj detaily
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
