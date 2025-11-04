// /api/statistics.js
export default async function handler(req, res) {
  try {
    const season = "20252026";
    const teamCodes = [
      "ANA", "ARI", "BOS", "BUF", "CGY", "CAR", "CHI", "COL",
      "CBJ", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL",
      "NSH", "NJD", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA",
      "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG",
      "WSH"
    ];

    const allPlayers = [];
    const seasonPath = `https://api-web.nhle.com/v1/club-stats`;

    // Pomocná funkcia – bezpečný fetch s timeoutom
    const safeFetch = async (url) => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 10000); // 10s
        const resp = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timeout);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        return data;
      } catch (err) {
        console.warn(`⚠️ Fetch chyba: ${url} – ${err.message}`);
        return null;
      }
    };

    // postupne, aby to nepadlo na časový limit
    for (const team of teamCodes) {
      const url = `${seasonPath}/${team}/${season}/2`;
      const data = await safeFetch(url);
      if (!Array.isArray(data)) continue;

      data.forEach((p) => {
        if (!p?.shootingPctg || !p.shots || p.shots <= 0) return;
        allPlayers.push({
          id: p.playerId,
          name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
          team,
          goals: p.goals ?? 0,
          shots: p.shots ?? 0,
          shootingPctg: Math.round((p.shootingPctg || 0) * 1000) / 10,
          gamesPlayed: p.gamesPlayed ?? 0,
          headshot: p.headshot || `https://assets.nhle.com/mugs/nhl/${season}/${team}/${p.playerId}.png`,
        });
      });
    }

    const top = allPlayers
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    console.log(`✅ Hráčov: ${allPlayers.length}, TOP: ${top.length}`);

    return res.status(200).json({
      ok: true,
      count: allPlayers.length,
      top,
    });
  } catch (err) {
    console.error("❌ Chyba v /api/statistics:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
