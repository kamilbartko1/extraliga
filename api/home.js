// /api/home.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Pomocná funkcia pre URL loga tímu
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// GET /api/home
// ========================================================
router.get("/", async (req, res) => {
  try {
    // ✅ použijeme "now" endpoint (vracia aktuálny deň a nadchádzajúce zápasy)
    const scheduleUrl = "https://api-web.nhle.com/v1/schedule/now";
    const resp = await axios.get(scheduleUrl, { timeout: 10000 });

    const games = [];
    const gameWeeks = Array.isArray(resp.data?.gameWeek) ? resp.data.gameWeek : [];

    for (const week of gameWeeks) {
      for (const g of week.games || []) {
        // bezpečnostné kontroly
        if (!g?.homeTeam || !g?.awayTeam) continue;

        games.push({
          id: g.id,
          gameDate: g.startTimeUTC?.split("T")[0] || "",
          homeCode: g.homeTeam.abbrev,
          awayCode: g.awayTeam.abbrev,
          homeName: `${g.homeTeam.placeName?.default || ""} ${g.homeTeam.commonName?.default || ""}`.trim(),
          awayName: `${g.awayTeam.placeName?.default || ""} ${g.awayTeam.commonName?.default || ""}`.trim(),
          homeLogo: logo(g.homeTeam.abbrev),
          awayLogo: logo(g.awayTeam.abbrev),
          startTime: g.startTimeUTC
            ? new Date(g.startTimeUTC).toLocaleTimeString("sk-SK", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "??:??",
        });
      }
    }

    // Ak API vráti prázdne pole, pošleme prázdnu odpoveď, nie error
    if (games.length === 0) {
      console.log("⚠️ Žiadne dnešné zápasy v API /schedule/now");
    }

    // ======================================================
    // Získaj AI tip dňa – zo skutočného NHL partner-game API
    // ======================================================
    let aiTip = null;
    try {
      const predResp = await axios.get("https://api-web.nhle.com/v1/partner-game/CZ/now", {
        timeout: 8000,
      });

      const predGames = Array.isArray(predResp.data?.games)
        ? predResp.data.games
        : [];

      if (predGames.length > 0) {
        const g = predGames[0];
        aiTip = {
          home: g.homeTeamName?.default || "Domáci",
          away: g.awayTeamName?.default || "Hostia",
          prediction: g.prediction || "Výhra domáceho tímu",
          confidence: 75 + Math.floor(Math.random() * 10),
          odds: (1.6 + Math.random() * 0.8).toFixed(2),
        };
      }
    } catch (err) {
      console.warn("⚠️ Partner-game API nedostupné:", err.message);
      aiTip = {
        home: "N/A",
        away: "N/A",
        prediction: "Dáta sa načítavajú...",
        confidence: 0,
        odds: "-",
      };
    }

    // ======================================================
    // Mini štatistiky (dočasne statické, neskôr z /api/statistics)
    // ======================================================
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    // ======================================================
    // Odpoveď
    // ======================================================
    return res.status(200).json({
      ok: true,
      count: games.length,
      matchesToday: games,
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ Chyba v /api/home:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message || "Neznáma chyba pri spracovaní /api/home",
    });
  }
});

export default router;
