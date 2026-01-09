// /api/live.js
import axios from "axios";

// Pomocná funkcia na logo tímu
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// SERVERLESS HANDLER – Live zápasy
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/live] Načítavam live zápasy...");

    const liveUrl = "https://nhl-score-api.herokuapp.com/api/scores/latest";
    const resp = await axios.get(liveUrl, { timeout: 15000 });
    const data = resp.data || {};

    const date = data.date || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

    // Transformácia zápasov do formátu pre frontend
    const games = gamesRaw.map((game) => {
      const home = game.teams?.home || {};
      const away = game.teams?.away || {};
      const status = game.status || {};
      const scores = game.scores || {};
      const gameStats = game.gameStats || {};
      const currentStats = game.currentStats || {};
      const goals = Array.isArray(game.goals) ? game.goals : [];

      // Formátovanie gólov
      const formattedGoals = goals.map((goal) => ({
        team: goal.team,
        period: goal.period,
        time: goal.min !== undefined && goal.sec !== undefined 
          ? `${String(goal.min).padStart(2, "0")}:${String(goal.sec).padStart(2, "0")}`
          : "",
        scorer: {
          name: goal.scorer?.player || "",
          playerId: goal.scorer?.playerId || null,
          seasonTotal: goal.scorer?.seasonTotal || 0,
        },
        assists: Array.isArray(goal.assists)
          ? goal.assists.map((a) => ({
              name: a.player || "",
              playerId: a.playerId || null,
              seasonTotal: a.seasonTotal || 0,
            }))
          : [],
      }));

      // Formátovanie štatistík zápasu
      const stats = {
        blocked: {
          home: gameStats.blocked?.[home.abbreviation] || 0,
          away: gameStats.blocked?.[away.abbreviation] || 0,
        },
        faceOffWinPercentage: {
          home: parseFloat(gameStats.faceOffWinPercentage?.[home.abbreviation] || 0),
          away: parseFloat(gameStats.faceOffWinPercentage?.[away.abbreviation] || 0),
        },
        giveaways: {
          home: gameStats.giveaways?.[home.abbreviation] || 0,
          away: gameStats.giveaways?.[away.abbreviation] || 0,
        },
        hits: {
          home: gameStats.hits?.[home.abbreviation] || 0,
          away: gameStats.hits?.[away.abbreviation] || 0,
        },
        pim: {
          home: gameStats.pim?.[home.abbreviation] || 0,
          away: gameStats.pim?.[away.abbreviation] || 0,
        },
        powerPlay: {
          home: {
            goals: gameStats.powerPlay?.[home.abbreviation]?.goals || 0,
            opportunities: gameStats.powerPlay?.[home.abbreviation]?.opportunities || 0,
            percentage: parseFloat(gameStats.powerPlay?.[home.abbreviation]?.percentage || 0),
          },
          away: {
            goals: gameStats.powerPlay?.[away.abbreviation]?.goals || 0,
            opportunities: gameStats.powerPlay?.[away.abbreviation]?.opportunities || 0,
            percentage: parseFloat(gameStats.powerPlay?.[away.abbreviation]?.percentage || 0),
          },
        },
        shots: {
          home: gameStats.shots?.[home.abbreviation] || 0,
          away: gameStats.shots?.[away.abbreviation] || 0,
        },
        takeaways: {
          home: gameStats.takeaways?.[home.abbreviation] || 0,
          away: gameStats.takeaways?.[away.abbreviation] || 0,
        },
      };

      // Formátovanie aktuálnych štatistík tímov
      const homeCurrentStats = currentStats?.records?.[home.abbreviation] || {};
      const awayCurrentStats = currentStats?.records?.[away.abbreviation] || {};
      const homeStreak = currentStats?.streaks?.[home.abbreviation] || {};
      const awayStreak = currentStats?.streaks?.[away.abbreviation] || {};
      const homeStandings = currentStats?.standings?.[home.abbreviation] || {};
      const awayStandings = currentStats?.standings?.[away.abbreviation] || {};

      // Formátovanie času zápasu
      let startTime = "";
      if (game.startTime) {
        try {
          const startDate = new Date(game.startTime);
          startTime = startDate.toLocaleTimeString("sk-SK", {
            timeZone: "Europe/Bratislava",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch (e) {
          startTime = "";
        }
      }

      // Formátovanie progressu zápasu
      const progress = status.progress || {};
      const periodInfo = {
        currentPeriod: progress.currentPeriod || 0,
        currentPeriodOrdinal: progress.currentPeriodOrdinal || "",
        timeRemaining: progress.currentPeriodTimeRemaining?.pretty || "",
        timeRemainingMin: progress.currentPeriodTimeRemaining?.min || 0,
        timeRemainingSec: progress.currentPeriodTimeRemaining?.sec || 0,
      };

      return {
        id: game.id || null,
        date: date.raw || "",
        datePretty: date.pretty || "",
        startTime,
        status: {
          state: status.state || "PREVIEW", // LIVE, PREVIEW, FINAL, atď.
          progress: periodInfo,
        },
        teams: {
          home: {
            id: home.id || null,
            abbreviation: home.abbreviation || "",
            locationName: home.locationName || "",
            shortName: home.shortName || "",
            teamName: home.teamName || "",
            fullName: `${home.locationName || ""} ${home.teamName || ""}`.trim(),
            logo: logo(home.abbreviation),
          },
          away: {
            id: away.id || null,
            abbreviation: away.abbreviation || "",
            locationName: away.locationName || "",
            shortName: away.shortName || "",
            teamName: away.teamName || "",
            fullName: `${away.locationName || ""} ${away.teamName || ""}`.trim(),
            logo: logo(away.abbreviation),
          },
        },
        scores: {
          home: scores[home.abbreviation] || 0,
          away: scores[away.abbreviation] || 0,
        },
        goals: formattedGoals,
        gameStats: stats,
        currentStats: {
          home: {
            record: {
              wins: homeCurrentStats.wins || 0,
              losses: homeCurrentStats.losses || 0,
              ot: homeCurrentStats.ot || 0,
            },
            streak: {
              type: homeStreak.type || "",
              count: homeStreak.count || 0,
            },
            standings: {
              divisionRank: homeStandings.divisionRank || "",
              conferenceRank: homeStandings.conferenceRank || "",
              leagueRank: homeStandings.leagueRank || "",
              pointsFromPlayoffSpot: homeStandings.pointsFromPlayoffSpot || 0,
            },
          },
          away: {
            record: {
              wins: awayCurrentStats.wins || 0,
              losses: awayCurrentStats.losses || 0,
              ot: awayCurrentStats.ot || 0,
            },
            streak: {
              type: awayStreak.type || "",
              count: awayStreak.count || 0,
            },
            standings: {
              divisionRank: awayStandings.divisionRank || "",
              conferenceRank: awayStandings.conferenceRank || "",
              leagueRank: awayStandings.leagueRank || "",
              pointsFromPlayoffSpot: awayStandings.pointsFromPlayoffSpot || 0,
            },
          },
        },
        links: {
          gameCenter: game.links?.gameCenter || "",
        },
      };
    });

    // Rozdelenie zápasov podľa stavu
    const liveGames = games.filter((g) => g.status.state === "LIVE");
    const previewGames = games.filter((g) => g.status.state === "PREVIEW");
    const finalGames = games.filter((g) => g.status.state === "FINAL");

    console.log(`✅ Načítaných zápasov: ${games.length} (Live: ${liveGames.length}, Preview: ${previewGames.length}, Final: ${finalGames.length})`);

    return res.status(200).json({
      ok: true,
      date: date.raw || "",
      datePretty: date.pretty || "",
      total: games.length,
      live: liveGames.length,
      preview: previewGames.length,
      final: finalGames.length,
      games,
      liveGames,
      previewGames,
      finalGames,
    });

  } catch (err) {
    console.error("❌ [/api/live] Chyba:", err.message);
    console.error("Stack:", err.stack);

    return res.status(200).json({
      ok: false,
      error: err.message,
      date: new Date().toISOString().slice(0, 10),
      total: 0,
      live: 0,
      preview: 0,
      final: 0,
      games: [],
      liveGames: [],
      previewGames: [],
      finalGames: [],
    });
  }
}
