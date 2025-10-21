// /api/strategies.js
import fs from "fs/promises";

const BET_AMOUNT = 10;
const ODDS = 1.9;

// Pomocná funkcia: skontroluj, či niekto dal aspoň 2 góly
function hasTwoGoals(boxscore) {
  const allPlayers = [
    ...(boxscore?.homeTeam?.skaters || []),
    ...(boxscore?.awayTeam?.skaters || []),
  ];
  return allPlayers.some(p => (p?.stats?.goals || 0) >= 2);
}

export default async function handler(req, res) {
  try {
    // 🔹 Oprava URL – garantujeme https://
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://nhlpro.sk";

const matchesResp = await fetch(`${BASE_URL}/api/matches`);

    const matchesData = await matchesResp.json();
    const matches = matchesData.matches || [];

    const results = [];
    let totalBet = 0;
    let totalProfit = 0;

    for (const m of matches) {
      const gameId = m.id;
      try {
        const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
        const box = await fetch(url);
        if (!box.ok) continue;
        const data = await box.json();

        const success = hasTwoGoals(data);
        totalBet += BET_AMOUNT;
        const profit = success ? BET_AMOUNT * (ODDS - 1) : -BET_AMOUNT;
        totalProfit += profit;

        results.push({
          id: gameId,
          home: m.home_team,
          away: m.away_team,
          date: m.date,
          result: success ? "✅ Áno" : "❌ Nie",
          profit,
        });
      } catch (err) {
        console.warn(`⚠️ Chyba pri zápase ${gameId}: ${err.message}`);
      }
    }

    res.status(200).json({
      ok: true,
      totalBet,
      totalProfit,
      results,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
