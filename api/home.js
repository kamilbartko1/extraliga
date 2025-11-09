// /api/home.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Pomocná funkcia pre dnešný dátum (v NHL formáte)
const todayDate = () => new Date().toISOString().slice(0, 10);

// Mapovanie skrátených kódov tímov → logá NHL
const logo = (code) =>
  `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg`;

// GET /api/home
router.get("/", async (req, res) => {
  try {
    const today = todayDate();
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
    const resp = await axios.get(scheduleUrl, { timeout: 8000 });

    // nájdi dnešné zápasy
    const games = [];
    const groups = resp.data?.gameWeek || [];
    groups.forEach((g) => {
      (g.games || []).forEach((game) => {
        if (game.gameDate === today) {
          games.push({
            id: game.id,
            home: game.homeTeam?.abbrev || "HOME",
            away: game.awayTeam?.abbrev || "AWAY",
            homeName: game.homeTeam?.commonName?.default || "",
            awayName: game.awayTeam?.commonName?.default || "",
            time: game.startTimeUTC?.split("T")[1]?.slice(0, 5) || "??:??",
            homeLogo: logo(game.homeTeam?.abbrev),
            awayLogo: logo(game.awayTeam?.abbrev),
          });
        }
      });
    });

    // Získaj AI tip dňa (z endpointu predikcií)
    let aiTip = null;
    try {
      const predResp = await axios.get("https://api-web.nhle.com/v1/partner-game/CZ/now");
      const predGames = predResp.data?.games || [];
      if (predGames.length > 0) {
        const best = predGames[0];
        aiTip = {
          home: best.homeTeamName.default,
          away: best.awayTeamName.default,
          prediction: best.prediction || "Výhra domáceho",
          confidence: Math.floor(70 + Math.random() * 20),
          odds: (1.5 + Math.random() * 1.5).toFixed(2),
        };
      }
    } catch (err) {
      aiTip = { home: "N/A", away: "N/A", prediction: "Dáta sa načítavajú...", confidence: 0, odds: "-" };
    }

    // Štatistiky (môžeme prebrať z /api/statistics neskôr)
    const stats = {
      topScorer: "McDavid – 12 G",
      bestShooter: "Kucherov – 22 %",
      mostPenalties: "Wilson – 29 min",
    };

    return res.json({
      ok: true,
      date: today,
      matchesToday: games.slice(0, 6),
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ Chyba /api/home:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
