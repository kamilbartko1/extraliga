// /api/strategies.js
const BET_AMOUNT = 10; // 10 € na zápas
const ODDS = 1.9;      // kurz 1.9

// Z boxscore vytiahni všetkých korčuliarov (forwards + defense) z oboch tímov
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
  return [...homeSkaters, ...awaySkaters];
}

// Podmienka: či niekto dal aspoň 2 góly
function hasTwoGoals(box) {
  const skaters = collectSkaters(box);
  return skaters.some(p => Number(p?.goals ?? p?.stats?.goals ?? 0) >= 2);
}

export default async function handler(req, res) {
  try {
    // 1) Načítaj všetky odohrané zápasy z tvojho backendu (pevná doména, spoľahlivé)
    const baseUrl = "https://nhlpro.sk";
    const matchesResp = await fetch(`${baseUrl}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) {
      throw new Error(`Nepodarilo sa načítať /api/matches (${matchesResp.status})`);
    }

    const matchesData = await matchesResp.json();
    const matches = Array.isArray(matchesData.matches) ? matchesData.matches : [];

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    // 2) Prejdi iba odohrané zápasy
    for (const m of matches) {
      if (m.status !== "closed") continue;

      totalBet += BET_AMOUNT;
      const gameId = m.id;
      let success = false;

      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const boxResp = await fetch(boxUrl, { cache: "no-store" });
        if (!boxResp.ok) throw new Error(`Boxscore ${gameId} nedostupné (${boxResp.status})`);
        const box = await boxResp.json();

        success = hasTwoGoals(box);
      } catch (e) {
        // ak boxscore nevieme načítať, počítaj to ako NEúspech (konzervatívne)
        console.warn(`⚠️ Zápas ${gameId}: ${e.message}`);
        success = false;
      }

      // 3) Výpočet zisku pre tento zápas
      const profitNum = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
      totalProfit += profitNum;

      // 4) Ulož riadok do výsledkov (profit nechávame ako číslo)
      results.push({
        id: gameId,
        date: m.date,
        home: m.home_team,
        away: m.away_team,
        twoGoals: success ? "✅ Áno" : "❌ Nie",
        result: success ? "Výhra" : "Prehra",
        profit: Number(profitNum.toFixed(2)),
      });
    }

    // 5) Odpoveď
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
