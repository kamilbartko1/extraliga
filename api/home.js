// /api/home.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Pomocná funkcia pre dnešný dátum (v NHL formáte)
const todayDate = () => new Date().toISOString().slice(0, 10);

// Pomocná funkcia na tvorbu loga
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// GET /api/home
// ========================================================
router.get("/", async (req, res) => {
  try {
    const today = todayDate();
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
    const resp = await axios.get(scheduleUrl, { timeout: 10000 });

    const games = [];
    const gameWeeks = Array.isArray(resp.data?.gameWeek) ? resp.data.gameWeek : [];

    // Prejdi všetky zápasy dnešného dňa
    for (const week of gameWeeks) {
      for (const g of week.games || []) {
        if (!g?.gameDate || !g?.homeTeam || !g?.awayTeam) continue;

        const gameDate = g.gameDate.split("T")[0];
        if (gameDate !== today) continue;

        games.push({
          id: g.id,
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

    // Ak dnes nie sú žiadne zápasy
    if (games.length === 0) {
      console.log(`⚠️ Žiadne zápasy pre ${today}`);
    }

    // ======================================================
    // Získaj AI tip dňa (fallback ak API zlyhá)
    // ======================================================
    let aiTip;
    try {
      const predResp = await axios.get("https://api-web.nhle.com/v1/partner-game/CZ/now", { timeout: 10000 });
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
      } else {
        aiTip = {
          home: "Florida Panthers",
          away: "New York Rangers",
          prediction: "Výhra Panthers",
          confidence: 78,
          odds: "1.85",
        };
      }
    } catch (err) {
      console.warn("⚠️ Predikcie nedostupné:", err.message);
      aiTip = {
        home: "Florida Panthers",
        away: "Boston Bruins",
        prediction: "Výhra Panthers",
        confidence: 77,
        odds: "1.83",
      };
    }

    // ======================================================
    // Mini štatistiky (môžeme neskôr ťahať z /api/statistics)
    // ======================================================
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    // ======================================================
    // Úspešná odpoveď
    // ======================================================
    return res.status(200).json({
      ok: true,
      date: today,
      matchesToday: games,
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ Chyba /api/home:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message || "Neznáma chyba pri spracovaní /api/home",
    });
  }
});

export default router;
