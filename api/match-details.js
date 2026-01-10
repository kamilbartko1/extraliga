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

    console.log("📦 Raw boxscore structure:", JSON.stringify(boxscore, null, 2).substring(0, 500));

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

    console.log("📊 Home players count:", homePlayers.length);
    console.log("📊 Away players count:", awayPlayers.length);
    if (homePlayers.length > 0) {
      console.log("📊 Sample home player:", JSON.stringify(homePlayers[0], null, 2));
    }

    const formatPlayer = (p) => {
      // NHL API používa rôzne formáty mena - skús všetky možnosti
      let name = null;
      
      // Skús najprv p.name?.default (ako v matches.js a ai.js)
      if (p.name?.default) {
        name = p.name.default.trim();
      } 
      // Potom skús p.playerName?.default
      else if (p.playerName?.default) {
        name = p.playerName.default.trim();
      } 
      // Potom skús firstName + lastName
      else if (p.firstName?.default || p.lastName?.default) {
        name = [p.firstName?.default, p.lastName?.default].filter(Boolean).join(" ").trim();
      }
      // Fallback - skús priamo bez .default
      else if (p.name) {
        name = String(p.name).trim();
      } else if (p.playerName) {
        name = String(p.playerName).trim();
      } else if (p.firstName || p.lastName) {
        name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
      }
      
      // Ak stále nemáme meno, skús sa pozrieť do priečinkov
      if (!name || name === "") {
        console.warn("⚠️ Nepodarilo sa parsovať meno hráča:", JSON.stringify(p, null, 2).substring(0, 200));
        name = "Unknown Player";
      }
      
      return {
        id: p.playerId,
        name: name,
        statistics: {
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
        },
      };
    };

    // Získaj period scores z linescore
    const periods = boxscore?.linescore?.periods || [];
    console.log("📊 Periods from linescore:", JSON.stringify(periods, null, 2));
    
    const period_scores = periods.map((p) => ({
      home_score: p.home ?? 0,
      away_score: p.away ?? 0,
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
