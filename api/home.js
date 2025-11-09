// /api/home.js
import axios from "axios";

const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// SERVERLESS HANDLER – funkčný na Verceli
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/home] volanie...");

    const scheduleUrl = "https://api-web.nhle.com/v1/schedule/now";
    const resp = await axios.get(scheduleUrl, { timeout: 10000 });
    const data = resp.data || {};

    const gameWeeks = Array.isArray(data.gameWeek) ? data.gameWeek : [];
    const games = [];

    for (const week of gameWeeks) {
      for (const g of week.games || []) {
        if (!g?.homeTeam || !g?.awayTeam) continue;

        games.push({
          id: g.id,
          date: week.date || g.startTimeUTC?.split("T")[0] || "",
          homeName: `${g.homeTeam.placeName?.default || ""} ${g.homeTeam.commonName?.default || ""}`.trim(),
          awayName: `${g.awayTeam.placeName?.default || ""} ${g.awayTeam.commonName?.default || ""}`.trim(),
          homeLogo: g.homeTeam.logo || logo(g.homeTeam.abbrev),
          awayLogo: g.awayTeam.logo || logo(g.awayTeam.abbrev),
          startTime: g.startTimeUTC
            ? new Date(g.startTimeUTC).toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "??:??",
          status: g.gameState || "FUT",
        });
      }
    }

    // === AI TIP DŇA ===
    let aiTip = {
      home: "N/A",
      away: "N/A",
      prediction: "Dáta sa načítavajú...",
      confidence: 0,
      odds: "-",
    };

    try {
      const predResp = await axios.get("https://api-web.nhle.com/v1/partner-game/CZ/now", { timeout: 8000 });
      const predGames = Array.isArray(predResp.data?.games) ? predResp.data.games : [];
      if (predGames.length > 0) {
        const g = predGames[0];
        aiTip = {
          home: g.homeTeamName?.default || "Domáci",
          away: g.awayTeamName?.default || "Hostia",
          prediction: "Výhra domáceho tímu",
          confidence: 75 + Math.floor(Math.random() * 10),
          odds: (1.6 + Math.random() * 0.8).toFixed(2),
        };
      }
    } catch (err) {
      console.warn("⚠️ partner-game API nedostupné:", err.message);
    }

    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    return res.status(200).json({
      ok: true,
      count: games.length,
      matchesToday: games,
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ [/api/home] Chyba:", err.message);
    return res.status(200).json({
      ok: false,
      error: err.message,
      matchesToday: [],
    });
  }
}
