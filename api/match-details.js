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

    // načítanie boxscore a score dát pre daný zápas
    const boxscoreUrl = `${BASE_URL}/gamecenter/${gameId}/boxscore`;
    
    // Získaj dátum zápasu z gameId (formát: YYYYMMDDNN, napr. 2025020697 = 2025-02-06)
    const gameIdStr = String(gameId);
    const year = gameIdStr.substring(0, 4);
    const month = gameIdStr.substring(4, 6);
    const day = gameIdStr.substring(6, 8);
    const gameDate = `${year}-${month}-${day}`;
    
    const scoreUrl = `${BASE_URL}/score/${gameDate}`;
    
    const [boxscoreResp, scoreResp] = await Promise.allSettled([
      axios.get(boxscoreUrl),
      axios.get(scoreUrl)
    ]);
    
    const boxscore = boxscoreResp.status === 'fulfilled' ? boxscoreResp.value.data : {};
    const scoreData = scoreResp.status === 'fulfilled' ? scoreResp.value.data : {};
    
    // Získaj goals z score endpointu - nájdi zápas s daným ID
    let goals = [];
    if (Array.isArray(scoreData?.games)) {
      const game = scoreData.games.find(g => String(g.id) === String(gameId));
      if (game && Array.isArray(game.goals)) {
        goals = game.goals;
      }
    }
    
    console.log("📊 Goals from score endpoint:", goals.length);
    if (goals.length > 0) {
      console.log("📊 Sample goal:", JSON.stringify(goals[0], null, 2).substring(0, 400));
    }

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

    // Získaj period scores - vypočítaj z goals array alebo použij linescore
    let period_scores = [];
    
    // Skús najprv linescore.periods (ak existuje)
    const linescorePeriods = boxscore?.linescore?.periods || [];
    if (linescorePeriods && linescorePeriods.length > 0) {
      period_scores = linescorePeriods.map((p) => ({
        home_score: p.home ?? 0,
        away_score: p.away ?? 0,
      }));
    } else if (goals && goals.length > 0) {
      // Ak nie sú v linescore, vypočítaj z goals array
      // Každý gól má period, homeScore a awayScore (kumulatívne)
      // Nájdi najvyššie kumulatívne skóre pre každú tretinu
      const periodScoresMap = {};
      
      goals.forEach(goal => {
        const periodNum = goal.period || goal.periodDescriptor?.number;
        if (periodNum) {
          const currentHome = goal.homeScore ?? 0;
          const currentAway = goal.awayScore ?? 0;
          const currentTotal = currentHome + currentAway;
          
          // Ulož najvyššie skóre pre každú tretinu (posledný gól má najvyššie kumulatívne skóre)
          if (!periodScoresMap[periodNum] || currentTotal > periodScoresMap[periodNum].total) {
            periodScoresMap[periodNum] = {
              home_score: currentHome,
              away_score: currentAway,
              total: currentTotal
            };
          }
        }
      });
      
      // Konvertuj na pole v správnom poradí (1, 2, 3...)
      const sortedPeriods = Object.keys(periodScoresMap)
        .map(Number)
        .sort((a, b) => a - b);
      
      period_scores = sortedPeriods.map(key => ({
        home_score: periodScoresMap[key].home_score,
        away_score: periodScoresMap[key].away_score
      }));
      
      console.log("📊 Period scores calculated from goals:", JSON.stringify(period_scores, null, 2));
    }

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
