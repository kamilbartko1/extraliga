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

    // načítanie boxscore a gamecenter dát pre daný zápas
    const boxscoreUrl = `${BASE_URL}/gamecenter/${gameId}/boxscore`;
    const gamecenterUrl = `${BASE_URL}/gamecenter/${gameId}/landing`;
    
    const [boxscoreResp, gamecenterResp] = await Promise.allSettled([
      axios.get(boxscoreUrl),
      axios.get(gamecenterUrl)
    ]);
    
    const boxscore = boxscoreResp.status === 'fulfilled' ? boxscoreResp.value.data : {};
    const gamecenter = gamecenterResp.status === 'fulfilled' ? gamecenterResp.value.data : {};
    
    // Získaj goals z gamecenter - podľa JSON-u sú v gamecenter.games[0].goals
    let goals = [];
    if (Array.isArray(gamecenter?.games) && gamecenter.games.length > 0) {
      // Nájdi zápas s daným ID alebo použij prvý
      const game = gamecenter.games.find(g => String(g.id) === String(gameId)) || gamecenter.games[0];
      goals = game?.goals || [];
    } else if (gamecenter?.goals && Array.isArray(gamecenter.goals)) {
      goals = gamecenter.goals;
    } else if (boxscore?.goals && Array.isArray(boxscore.goals)) {
      goals = boxscore.goals;
    }
    
    console.log("📊 Goals from gamecenter:", goals.length);
    if (goals.length > 0) {
      console.log("📊 Sample goal structure:", JSON.stringify(goals[0], null, 2).substring(0, 500));
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
      // Nájdi posledný gól z každej tretiny - použij kumulatívne skóre
      const periodScoresMap = {};
      
      goals.forEach(goal => {
        const periodNum = goal.period || goal.periodDescriptor?.number;
        if (periodNum) {
          // Použij kumulatívne skóre z gólu (homeScore a awayScore sú kumulatívne)
          const currentHome = goal.homeScore ?? 0;
          const currentAway = goal.awayScore ?? 0;
          
          // Ulož posledné skóre pre každú tretinu (prepíše, ak už existuje neskorší gól)
          if (!periodScoresMap[periodNum]) {
            periodScoresMap[periodNum] = {
              home_score: currentHome,
              away_score: currentAway,
              total: currentHome + currentAway
            };
          } else {
            // Ak je toto skóre väčšie (novší gól), ulož ho
            const existingTotal = periodScoresMap[periodNum].total;
            if (currentHome + currentAway > existingTotal) {
              periodScoresMap[periodNum] = {
                home_score: currentHome,
                away_score: currentAway,
                total: currentHome + currentAway
              };
            }
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
    }
    
    console.log("📊 Goals array length:", goals.length);
    console.log("📊 Period scores calculated:", JSON.stringify(period_scores, null, 2));

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
