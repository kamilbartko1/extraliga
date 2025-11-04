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

    // 🔹 Bezpečný fetch s timeoutom a error-handlingom
    const safeFetch = async (url) => {
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 10000);
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

    // 🔹 Načítaj štatistiky všetkých tímov
    for (const team of teamCodes) {
      const url = `${baseUrl}/${team}/${season}/2`; // správny endpoint
      const data = await safeFetch(url);

      if (!data || !data.skaters || !Array.isArray(data.skaters)) {
        console.warn(`⚠️ ${team}: žiadni hráči`);
        continue;
      }

      const skaters = data.skaters.filter(
        (p) =>
          typeof p.shootingPctg === "number" &&
          p.shots > 0 &&
          p.gamesPlayed > 0
      );

      skaters.forEach((p) => {
        allPlayers.push({
          id: p.playerId,
          name: `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim(),
          team,
          goals: p.goals ?? 0,
          shots: p.shots ?? 0,
          shootingPctg: Math.round((p.shootingPctg || 0) * 1000) / 10, // napr. 0.171429 → 17.1 %
          gamesPlayed: p.gamesPlayed ?? 0,
          headshot:
            p.headshot ||
            `https://assets.nhle.com/mugs/nhl/${season}/${team}/${p.playerId}.png`,
        });
      });

      console.log(`✅ ${team}: ${skaters.length} hráčov spracovaných`);
    }

    // 🔹 Zoradíme podľa úspešnosti streľby
    const top = allPlayers
      .sort((a, b) => b.shootingPctg - a.shootingPctg)
      .slice(0, 50);

    console.log(`🏒 Spolu hráčov: ${allPlayers.length}, TOP 50 pripravené.`);

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
