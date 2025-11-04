// /api/statistics.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const season = "20252026";
    // všetky tímy NHL (trojpísmenové kódy)
    const teamCodes = [
      "ANA", "ARI", "BOS", "BUF", "CGY", "CAR", "CHI", "COL",
      "CBJ", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL",
      "NSH", "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA",
      "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG",
      "WSH"
    ];

    // limit počtu paralelných volaní, aby si nepreťažil API
    const CONCURRENCY = 5;
    let index = 0;
    const allPlayers = [];

    async function worker() {
      while (index < teamCodes.length) {
        const i = index++;
        const team = teamCodes[i];
        try {
          const url = `https://api-web.nhle.com/v1/club-stats/${team}/${season}/2`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`Chyba ${resp.status} pre tím ${team}`);
          const data = await resp.json();
          const players = Array.isArray(data) ? data : [];

          for (const p of players) {
            if (!p?.shootingPctg || !p.shots || p.shots === 0) continue;

            allPlayers.push({
              id: p.playerId,
              name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
              team,
              goals: p.goals ?? 0,
              shots: p.shots ?? 0,
              shootingPctg: Math.round((p.shootingPctg || 0) * 1000) / 10, // napr. 17.1
              gamesPlayed: p.gamesPlayed ?? 0,
              headshot: p.headshot || `https://assets.nhle.com/mugs/nhl/${season}/${team}/${p.playerId}.png`
            });
          }

          console.log(`✅ ${team}: ${players.length} hráčov`);
        } catch (err) {
          console.warn(`⚠️ ${team}: ${err.message}`);
        }
      }
    }

    // spustenie s limitom paralelne
    const workers = Array(CONCURRENCY).fill(0).map(() => worker());
    await Promise.all(workers);

    console.log(`🔹 Načítaných hráčov: ${allPlayers.length}`);

    // zoradenie podľa úspešnosti streľby
    const top = allPlayers
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    return res.status(200).json({
      ok: true,
      count: allPlayers.length,
      top
    });
  } catch (err) {
    console.error("❌ Chyba pri spracovaní:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
