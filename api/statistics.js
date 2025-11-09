// /api/statistics.js
export default async function handler(req, res) {
  try {
    const season = "20252026";
    const teamCodes = [
      "ANA", "ARI", "BOS", "BUF", "CGY", "CAR", "CHI", "COL",
      "CBJ", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL",
      "NSH", "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA",
      "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"
    ];

    const allPlayers = [];
    const baseUrl = `https://api-web.nhle.com/v1/club-stats`;

    // 🔹 Bezpečný fetch s timeoutom
    const safeFetch = async (url) => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 10000);
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
      } catch (err) {
        console.warn(`⚠️ Fetch chyba: ${url} – ${err.message}`);
        return null;
      }
    };

    // 🔹 Načítaj štatistiky všetkých tímov
    for (const team of teamCodes) {
      const url = `${baseUrl}/${team}/${season}/2`;
      const data = await safeFetch(url);
      if (!data || !Array.isArray(data.skaters)) continue;

      data.skaters.forEach((p) => {
        if (!p.gamesPlayed || (!p.goals && !p.assists && !p.shots)) return;

        allPlayers.push({
          id: p.playerId,
          name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
          team,
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
          points: (p.goals ?? 0) + (p.assists ?? 0),
          shots: p.shots ?? 0,
          shootingPctg: Math.round((p.shootingPctg || 0) * 1000) / 10,
          plusMinus: p.plusMinus ?? 0,
          pim: p.penaltyMinutes ?? 0,
          toi: Math.round((p.avgTimeOnIcePerGame ?? 0) / 60 * 10) / 10, // sekundy → minúty
          powerPlayGoals: p.powerPlayGoals ?? 0,
          gamesPlayed: p.gamesPlayed ?? 0,
          headshot:
            p.headshot ||
            `https://assets.nhle.com/mugs/nhl/${season}/${team}/${p.playerId}.png`,
        });
      });
    }

    // 🔹 Rebríčky (Top 50)
    const topAccuracy = [...allPlayers]
      .filter(p => p.shootingPctg > 0 && p.shots > 0)
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    const topShots = [...allPlayers]
      .sort((a, b) => b.shots - a.shots)
      .slice(0, 50);

    const topGoals = [...allPlayers]
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 50);

    const topAssists = [...allPlayers]
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 50);

    const topPoints = [...allPlayers]
      .sort((a, b) => b.points - a.points)
      .slice(0, 50);

    const topPlusMinus = [...allPlayers]
      .sort((a, b) => b.plusMinus - a.plusMinus)
      .slice(0, 50);

    const topPIM = [...allPlayers]
      .sort((a, b) => b.pim - a.pim)
      .slice(0, 50);

    const topTOI = [...allPlayers]
      .sort((a, b) => b.toi - a.toi)
      .slice(0, 50);

    const topPowerPlayGoals = [...allPlayers]
      .sort((a, b) => b.powerPlayGoals - a.powerPlayGoals)
      .slice(0, 50);

    // 🔹 Odpoveď
    return res.status(200).json({
      ok: true,
      count: allPlayers.length,
      topAccuracy,
      topShots,
      topGoals,
      topAssists,
      topPoints,
      topPlusMinus,
      topPIM,
      topTOI,
      topPowerPlayGoals,
    });
  } catch (err) {
    console.error("❌ Chyba v /api/statistics:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
