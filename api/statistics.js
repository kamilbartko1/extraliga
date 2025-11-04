// /api/statistics.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    console.log("📊 Načítavam štatistiky hráčov (shooting %)");

    // Trojpísmenové skratky všetkých NHL tímov
    const teams = [
      "ANA", "ARI", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CBJ", "DAL",
      "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NSH", "NJD", "NYI", "NYR",
      "OTT", "PHI", "PIT", "SJS", "SEA", "STL", "TBL", "TOR", "UTA", "VAN",
      "VGK", "WPG", "WSH"
    ];

    const SEASON = "20252026"; // aktuálna sezóna
    const STATS_TYPE = 2; // 2 = skutočné štatistiky hráčov

    const allPlayers = [];
    const BATCH_SIZE = 6; // koľko tímov naraz (kvôli performance)

    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
      const batch = teams.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (team) => {
          const url = `https://api-web.nhle.com/v1/club-stats/${team}/${SEASON}/${STATS_TYPE}`;
          const resp = await axios.get(url, { timeout: 10000 });
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
                shootingPctg: Number((shootingPct * 100).toFixed(1)), // na %
                gamesPlayed: p.gamesPlayed || 0,
                headshot: p.headshot || "",
              });
            }
          }
        })
      );

      results.forEach((r, i) => {
        if (r.status === "rejected") console.warn(`⚠️ ${batch[i]} zlyhalo: ${r.reason?.message}`);
      });
    }

    // Zoradíme podľa % úspešnosti strelby
    const topPlayers = allPlayers
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    console.log(`✅ Načítaných hráčov: ${allPlayers.length}, Top50 pripravených`);

    res.status(200).json({
      ok: true,
      count: allPlayers.length,
      top: topPlayers,
    });

  } catch (err) {
    console.error("❌ Chyba v /api/statistics:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
s