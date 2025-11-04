// /api/statistics.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    console.log("📊 Načítavam štatistiky hráčov (shooting %)");

    // Zoznam len 10 tímov na test (aby sme nevyčerpali Vercel čas)
    const teams = [
      "TOR", "EDM", "BOS", "NYR", "COL",
      "MTL", "FLA", "WPG", "VGK", "DET"
    ];

    const SEASON = "20252026";
    const STATS_TYPE = 2;
    const allPlayers = [];

    // === spracuj postupne, nie všetko naraz ===
    for (const team of teams) {
      const url = `https://api-web.nhle.com/v1/club-stats/${team}/${SEASON}/${STATS_TYPE}`;
      console.log("📥", url);

      try {
        const resp = await axios.get(url, { timeout: 8000 });
        const players = resp.data?.skaters || [];
        for (const p of players) {
          const shootingPct = p.shootingPctg ?? 0;
          if (shootingPct > 0) {
            allPlayers.push({
              id: p.playerId,
              name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
              team,
              goals: p.goals || 0,
              shots: p.shots || 0,
              shootingPctg: Number((shootingPct * 100).toFixed(1)),
              gamesPlayed: p.gamesPlayed || 0,
              headshot: p.headshot || ""
            });
          }
        }
      } catch (err) {
        console.warn(`⚠️ ${team}: ${err.message}`);
      }
    }

    const topPlayers = allPlayers
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    res.status(200).json({
      ok: true,
      count: allPlayers.length,
      top: topPlayers
    });

  } catch (err) {
    console.error("❌ Chyba v /api/statistics:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
