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
    
    console.log("📊 Fetching score for date:", gameDate);
    console.log("📊 GameId:", gameId);
    
    const [boxscoreResp, scoreResp] = await Promise.allSettled([
      axios.get(boxscoreUrl),
      axios.get(scoreUrl)
    ]);
    
    // Bezpečné parsovanie odpovedí
    let boxscore = {};
    let scoreData = {};
    
    if (boxscoreResp.status === 'fulfilled') {
      try {
        boxscore = boxscoreResp.value?.data || {};
      } catch (e) {
        console.error("❌ Error parsing boxscore:", e.message);
      }
    } else {
      console.error("❌ Boxscore request failed:", boxscoreResp.reason?.message);
    }
    
    if (scoreResp.status === 'fulfilled') {
      try {
        scoreData = scoreResp.value?.data || {};
      } catch (e) {
        console.error("❌ Error parsing score data:", e.message);
      }
    } else {
      console.error("❌ Score request failed:", scoreResp.reason?.message);
    }
    
    console.log("📊 Score API response status:", scoreResp.status);
    console.log("📊 Games in score response:", scoreData?.games?.length || 0);
    
    // Získaj goals z score endpointu alebo z boxscore - nájdi zápas s daným ID
    let goals = [];
    
    // Skús najprv score endpoint
    if (Array.isArray(scoreData?.games) && scoreData.games.length > 0) {
      try {
        const gameIds = scoreData.games.map(g => g?.id).filter(Boolean);
        console.log("📊 Available game IDs in score:", gameIds);
        const game = scoreData.games.find(g => g && String(g.id) === String(gameId));
        console.log("📊 Found game in score:", game ? "YES" : "NO");
        
        if (game && Array.isArray(game.goals)) {
          goals = game.goals;
          console.log("📊 Goals found in score game:", goals.length);
        } else if (game) {
          console.log("📊 Game found but no goals array:", game.goals ? typeof game.goals : "missing");
        }
      } catch (e) {
        console.error("❌ Error processing score games:", e.message);
      }
    } else {
      console.warn("⚠️ scoreData.games is not an array or is empty");
      if (scoreData && typeof scoreData === 'object') {
        console.log("📊 Score data keys:", Object.keys(scoreData));
      }
    }
    
    // Ak nemáme goals z score, skús boxscore
    if (!goals || goals.length === 0) {
      console.log("📊 Trying to get goals from boxscore...");
      try {
        if (boxscore?.scoringPlays && Array.isArray(boxscore.scoringPlays)) {
          console.log("📊 Found scoringPlays in boxscore:", boxscore.scoringPlays.length);
          goals = boxscore.scoringPlays;
        } else if (boxscore?.plays && Array.isArray(boxscore.plays)) {
          console.log("📊 Found plays in boxscore:", boxscore.plays.length);
          const scoringPlays = boxscore.plays.filter(p => p && p.type === 'GOAL');
          if (scoringPlays.length > 0) {
            goals = scoringPlays;
          }
        }
      } catch (e) {
        console.error("❌ Error getting goals from boxscore:", e.message);
      }
    }
    
    console.log("📊 Final goals array length:", goals.length);
    if (goals.length > 0) {
      try {
        console.log("📊 First goal structure:", JSON.stringify(goals[0], null, 2).substring(0, 500));
        console.log("📊 All goals periods:", goals.slice(0, 5).map(g => ({ 
          period: g?.period || g?.periodDescriptor?.number, 
          home: g?.homeScore || g?.homeScoreAfter, 
          away: g?.awayScore || g?.awayScoreAfter 
        })));
      } catch (e) {
        console.error("❌ Error logging goals:", e.message);
      }
    } else {
      console.warn("⚠️ NO GOALS FOUND!");
      if (scoreData && typeof scoreData === 'object') {
        try {
          console.log("📊 Score data sample:", JSON.stringify(scoreData, null, 2).substring(0, 300));
        } catch (e) {
          console.log("📊 Score data exists but cannot stringify");
        }
      }
      if (boxscore && typeof boxscore === 'object') {
        console.log("📊 Boxscore keys:", Object.keys(boxscore).slice(0, 10));
      }
    }

    // --- štruktúra odpovede (aby pasovala na frontend) ---
    const homeTeam = (boxscore && boxscore.homeTeam) ? boxscore.homeTeam : {};
    const awayTeam = (boxscore && boxscore.awayTeam) ? boxscore.awayTeam : {};
    
    // Získaj všetkých hráčov (forwards + defense + goalies) - bezpečne
    const playerStats = boxscore?.playerByGameStats || {};
    const homeStats = playerStats.homeTeam || {};
    const awayStats = playerStats.awayTeam || {};
    
    const homeForwards = Array.isArray(homeStats.forwards) ? homeStats.forwards : [];
    const homeDefense = Array.isArray(homeStats.defense) ? homeStats.defense : [];
    const homeGoalies = Array.isArray(homeStats.goalies) ? homeStats.goalies : [];
    const awayForwards = Array.isArray(awayStats.forwards) ? awayStats.forwards : [];
    const awayDefense = Array.isArray(awayStats.defense) ? awayStats.defense : [];
    const awayGoalies = Array.isArray(awayStats.goalies) ? awayStats.goalies : [];
    
    const homePlayers = [...homeForwards, ...homeDefense, ...homeGoalies].filter(Boolean);
    const awayPlayers = [...awayForwards, ...awayDefense, ...awayGoalies].filter(Boolean);

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
      console.log("📊 Calculating period scores from goals array (length:", goals.length, ")");
      // Ak nie sú v linescore, vypočítaj z goals array
      // Každý gól má period, homeScore a awayScore (kumulatívne)
      // Nájdi najvyššie kumulatívne skóre pre každú tretinu
      const periodScoresMap = {};
      
      goals.forEach((goal, index) => {
        // Skús rôzne formáty period a scores
        const periodNum = goal.period || goal.periodDescriptor?.number || goal.periodNumber;
        const homeScore = goal.homeScore || goal.homeScoreAfter || goal.home ?? 0;
        const awayScore = goal.awayScore || goal.awayScoreAfter || goal.away ?? 0;
        
        console.log(`📊 Goal ${index}: period=${periodNum}, homeScore=${homeScore}, awayScore=${awayScore}`);
        
        if (periodNum) {
          const currentHome = Number(homeScore) || 0;
          const currentAway = Number(awayScore) || 0;
          const currentTotal = currentHome + currentAway;
          
          // Ulož najvyššie skóre pre každú tretinu (posledný gól má najvyššie kumulatívne skóre)
          if (!periodScoresMap[periodNum] || currentTotal >= periodScoresMap[periodNum].total) {
            periodScoresMap[periodNum] = {
              home_score: currentHome,
              away_score: currentAway,
              total: currentTotal
            };
            console.log(`📊 Updated period ${periodNum}: ${currentHome}:${currentAway}`);
          }
        } else {
          console.warn(`⚠️ Goal ${index} has no period number!`, JSON.stringify(goal, null, 2).substring(0, 200));
        }
      });
      
      console.log("📊 PeriodScoresMap before sorting:", JSON.stringify(periodScoresMap, null, 2));
      
      // Konvertuj na pole v správnom poradí (1, 2, 3...)
      const sortedPeriods = Object.keys(periodScoresMap)
        .map(Number)
        .sort((a, b) => a - b);
      
      console.log("📊 Sorted periods:", sortedPeriods);
      
      period_scores = sortedPeriods.map(key => ({
        home_score: periodScoresMap[key].home_score,
        away_score: periodScoresMap[key].away_score
      }));
      
      console.log("📊 FINAL period_scores:", JSON.stringify(period_scores, null, 2));
    } else {
      console.error("❌ No goals found! Goals array length:", goals?.length || 0);
      console.error("❌ Linescore periods:", linescorePeriods?.length || 0);
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
    
    try {
      console.log("📦 Formatted response preview - period_scores:", formatted.sport_event_status.period_scores.length);
      res.status(200).json(formatted);
    } catch (jsonErr) {
      console.error("❌ Error serializing response:", jsonErr.message);
      res.status(500).json({ error: "Chyba pri serializácii odpovede" });
    }
  } catch (err) {
    console.error("❌ Chyba pri načítaní detailov zápasu:", err.message);
    console.error("❌ Stack trace:", err.stack);
    res.status(500).json({ 
      error: "Chyba pri načítaní detailov zápasu NHL",
      message: err.message 
    });
  }
}
