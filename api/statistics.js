// /api/statistics.js
export default async function handler(req, res) {
  // 🔥 OPTIMALIZÁCIA: Edge cache 15 minút (štatistiky sa nemenia často)
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');
  
  try {
    const season = "20252026";
    const teamCodes = [
      "ANA","ARI","BOS","BUF","CGY","CAR","CHI","COL",
      "CBJ","DAL","DET","EDM","FLA","LAK","MIN","MTL",
      "NSH","NJD","NYI","NYR","OTT","PHI","PIT","SEA",
      "SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH"
    ];

    const baseUrl = `https://api-web.nhle.com/v1/club-stats`;

    // 🔹 interná mini cache (v pamäti len 60 sekúnd)
    if (global._NHL_CACHE && Date.now() - global._NHL_CACHE.time < 60000) {
      return res.status(200).json(global._NHL_CACHE.data);
    }

    const allPlayers = [];

    // 🔹 rýchlejšie – fetch všetkých tímov paralelne
    const results = await Promise.allSettled(
      teamCodes.map(async (team) => {
        const url = `${baseUrl}/${team}/${season}/2`;
        const resp = await fetch(url, { cache: "no-store", timeout: 10000 });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return { team, data: await resp.json() };
      })
    );

    // 🔹 spracovanie všetkých odpovedí (aj tých, čo zlyhali)
    results.forEach((r) => {
      if (r.status !== "fulfilled" || !r.value?.data?.skaters) return;
      const { team, data } = r.value;

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
          toi: Math.round((p.avgTimeOnIcePerGame ?? 0) / 60 * 10) / 10,
          powerPlayGoals: p.powerPlayGoals ?? 0,
          gamesPlayed: p.gamesPlayed ?? 0,
          headshot: `https://assets.nhle.com/mugs/nhl/${season}/${team}/${p.playerId}.png`,
        });
      });
    });

    // 🔹 Ak sa nenahrali žiadne dáta, vráť info (ale nie ako chyba)
    if (allPlayers.length === 0) {
      return res.status(200).json({ ok: true, count: 0 });
    }

    // 🔹 Rebríčky
    const topAccuracy = allPlayers.filter(p => p.shootingPctg > 0 && p.shots > 0)
      .sort((a, b) => b.shootingPctg - a.shootingPctg).slice(0, 50);
    const topShots = allPlayers.sort((a, b) => b.shots - a.shots).slice(0, 50);
    const topGoals = allPlayers.sort((a, b) => b.goals - a.goals).slice(0, 50);
    const topAssists = allPlayers.sort((a, b) => b.assists - a.assists).slice(0, 50);
    const topPoints = allPlayers.sort((a, b) => b.points - a.points).slice(0, 50);
    const topPlusMinus = allPlayers.sort((a, b) => b.plusMinus - a.plusMinus).slice(0, 50);
    const topPIM = allPlayers.sort((a, b) => b.pim - a.pim).slice(0, 50);
    const topTOI = allPlayers.sort((a, b) => b.toi - a.toi).slice(0, 50);
    const topPowerPlayGoals = allPlayers.sort((a, b) => b.powerPlayGoals - a.powerPlayGoals).slice(0, 50);

    const dataOut = {
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
    };

    // 🔹 uložíme do mini-cache
    global._NHL_CACHE = { time: Date.now(), data: dataOut };

    res.status(200).json(dataOut);
  } catch (err) {
    console.error("❌ /api/statistics:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
