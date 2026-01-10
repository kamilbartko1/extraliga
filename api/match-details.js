import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";

/**
 * Endpoint: /api/match-details?gameId=2025020061
 * Slúži na zobrazenie detailov (hráčov, góly, asistencie, tretiny, atď.)
 * Využíva NHL Web API endpoint:
 * https://api-web.nhle.com/v1/gamecenter/{game-id}/boxscore
 */
export default async function handler(req, res) {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return res.status(400).json({ error: "Missing parameter: gameId" });
    }

    // načítanie boxscore pre daný zápas
    const url = `${BASE_URL}/gamecenter/${gameId}/boxscore`;
    const response = await axios.get(url);
    const boxscore = response.data;

    // --- štruktúra odpovede (aby pasovala na frontend) ---
    const homeTeam = boxscore?.homeTeam || {};
    const awayTeam = boxscore?.awayTeam || {};
    
    // Získaj všetkých hráčov (forwards + defense + goalies)
    const homeForwards = boxscore?.playerByGameStats?.homeTeam?.forwards || [];
    const homeDefense = boxscore?.playerByGameStats?.homeTeam?.defense || [];
    const homeGoalies = boxscore?.playerByGameStats?.homeTeam?.goalies || [];
    const awayForwards = boxscore?.playerByGameStats?.awayTeam?.forwards || [];
    const awayDefense = boxscore?.playerByGameStats?.awayTeam?.defense || [];
    const awayGoalies = boxscore?.playerByGameStats?.awayTeam?.goalies || [];
    
    const homePlayers = [...homeForwards, ...homeDefense, ...homeGoalies];
    const awayPlayers = [...awayForwards, ...awayDefense, ...awayGoalies];

    // Debugging - ukáž prvého hráča
    if (homePlayers.length > 0) {
      const samplePlayer = homePlayers[0];
      console.log("📊 Sample home player keys:", Object.keys(samplePlayer));
      console.log("📊 Sample home player:", JSON.stringify(samplePlayer, null, 2).substring(0, 500));
    }

    const formatPlayer = (p) => {
      // NHL API používa p.name?.default (ako v matches.js a ai.js)
      // Skús všetky možné formáty
      let name = null;
      
      if (p?.name?.default) {
        name = p.name.default;
      } else if (p?.firstName?.default && p?.lastName?.default) {
        name = `${p.firstName.default} ${p.lastName.default}`;
      } else if (p?.name) {
        name = String(p.name);
      } else if (p?.firstName && p?.lastName) {
        name = `${p.firstName} ${p.lastName}`;
      }
      
      if (!name || name.trim() === "") {
        console.warn("⚠️ Nepodarilo sa parsovať meno hráča. Objekt:", JSON.stringify(p, null, 2).substring(0, 300));
        name = "Unknown Player";
      }
      
      return {
        id: p.playerId,
        name: name.trim(),
        statistics: {
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
        },
      };
    };

    // Získaj period scores z linescore - skús rôzne možnosti
    let periods = boxscore?.linescore?.periods || [];
    
    // Ak nie sú v linescore.periods, skús iné miesta
    if (!periods || periods.length === 0) {
      // Skús boxscore.periods
      periods = boxscore?.periods || [];
    }
    if (!periods || periods.length === 0) {
      // Skús boxscore.gameState.periods
      periods = boxscore?.gameState?.periods || [];
    }
    
    console.log("📊 Linescore object:", boxscore?.linescore ? Object.keys(boxscore.linescore) : "not found");
    console.log("📊 Periods found:", periods.length, JSON.stringify(periods, null, 2));
    
    const period_scores = periods.map((p) => ({
      home_score: p.home ?? p.homeScore ?? 0,
      away_score: p.away ?? p.awayScore ?? 0,
    }));

    const formatted = {
      sport_event_status: {
        home_score: homeTeam.score ?? 0,
        away_score: awayTeam.score ?? 0,
        period_scores: period_scores,
      },
      statistics: {
        totals: {
          competitors: [
            {
              qualifier: "home",
              name: `${homeTeam.placeName?.default || ""} ${homeTeam.commonName?.default || ""}`.trim() || "Home Team",
              players: homePlayers.map(formatPlayer),
            },
            {
              qualifier: "away",
              name: `${awayTeam.placeName?.default || ""} ${awayTeam.commonName?.default || ""}`.trim() || "Away Team",
              players: awayPlayers.map(formatPlayer),
            },
          ],
        },
      },
    };
    
    console.log("📦 Formatted response:", JSON.stringify(formatted, null, 2).substring(0, 1000));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("❌ Chyba pri načítaní detailov zápasu:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní detailov zápasu NHL" });
  }
}
