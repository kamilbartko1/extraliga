// /api/strategies.js
const BET_AMOUNT = 10;
const ODDS = 2.0;

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
    ...homeSkaters.map(p => ({ ...p, team: home.teamName?.default || "Home" })),
    ...awaySkaters.map(p => ({ ...p, team: away.teamName?.default || "Away" })),
  ];
}

function playersWithTwoGoals(box) {
  return collectSkaters(box)
    .filter(p => Number(p?.goals ?? p?.stats?.goals ?? 0) >= 2)
    .map(p => ({
      name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
      goals: Number(p?.goals ?? p?.stats?.goals ?? 0),
      assists: Number(p?.assists ?? p?.stats?.assists ?? 0),
      plusMinus: Number(p?.plusMinus ?? p?.stats?.plusMinus ?? 0),
      shots: Number(p?.shots ?? p?.stats?.shots ?? 0),
      team: p.team || "",
    }));
}

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    // === 🔹 1) Ak je zadaný ?id=, vráť detail pre jeden zápas ===
    if (id) {
      const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${id}/boxscore`;
      const boxResp = await fetch(boxUrl, { cache: "no-store" });
      if (!boxResp.ok) throw new Error(`Boxscore ${id} nedostupné (${boxResp.status})`);
      const box = await boxResp.json();
      const players = playersWithTwoGoals(box);
      return res.status(200).json({ ok: true, id, players });
    }

    // === 🔹 2) Inak – vráť výpočty pre všetky zápasy ===
    const baseUrl = "https://nhlpro.sk";
    const matchesResp = await fetch(`${baseUrl}/api/matches`, { cache: "no-store" });
    if (!matchesResp.ok) throw new Error(`Nepodarilo sa načítať /api/matches`);
    const matchesData = await matchesResp.json();
    const matches = Array.isArray(matchesData.matches) ? matchesData.matches : [];

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    for (const m of matches) {
      if (m.status !== "closed") continue;
      totalBet += BET_AMOUNT;
      const gameId = m.id;
      let success = false;

      try {
        const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const boxResp = await fetch(boxUrl, { cache: "no-store" });
        if (!boxResp.ok) throw new Error(`Boxscore ${gameId} nedostupné`);
        const box = await boxResp.json();
        success = playersWithTwoGoals(box).length > 0;
      } catch (e) {
        console.warn(`⚠️ Zápas ${gameId}: ${e.message}`);
        success = false;
      }

      const profitNum = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
      totalProfit += profitNum;

      results.push({
        id: gameId,
        date: m.date,
        home: m.home_team,
        away: m.away_team,
        twoGoals: success ? "✅" : "❌",
        result: success ? "Výhra" : "Prehra",
        profit: Number(profitNum.toFixed(2)),
      });
    }

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
