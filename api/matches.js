// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08"; // začiatok sezóny
    const TODAY = new Date().toISOString().slice(0, 10);

    // === Pomocné ===
    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const dateRange = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRange.push(formatDate(new Date(d)));
    }

    const allMatches = [];
    const teamRatings = {};
    const playerRatings = {};

    // === KONŠTANTY ===
    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    const START_PLAYER_RATING = 1500;
    const GOAL_POINTS = 50;
    const ASSIST_POINTS = 20;
    const PP_GOAL_POINTS = 30;
    const TOI_POINTS_PER_MIN = 1;

    const ensureTeam = (name) => {
      if (name && teamRatings[name] == null) teamRatings[name] = START_TEAM_RATING;
    };

    const pickPlayerName = (p) =>
      p?.name?.default ||
      [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim() ||
      "Neznámy hráč";

    const extractSkaters = (teamNode) => [
      ...(Array.isArray(teamNode?.forwards) ? teamNode.forwards : []),
      ...(Array.isArray(teamNode?.defense) ? teamNode.defense : []),
    ];

    const toiToMinutes = (toi) => {
      if (!toi) return 0;
      const parts = String(toi).split(":").map(Number);
      if (parts.length === 2) return parts[0] + parts[1] / 60; // mm:ss
      if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // hh:mm:ss
      return 0;
    };

    // === PRECHOD PO DŇOCH ===
    for (const day of dateRange) {
      try {
        const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (!resp.ok) continue;

        const data = await resp.json();
        const games = data.games || [];

        for (const g of games) {
          const state = String(g.gameState || "").toUpperCase();
          if (state !== "OFF") continue; // berieme len ukončené zápasy

          const match = {
            id: g.id,
            date: day,
            status: "closed",
            home_team: g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home",
            away_team: g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away",
            home_score: g.homeTeam?.score ?? 0,
            away_score: g.awayTeam?.score ?? 0,
            start_time: g.startTimeUTC,
          };
          allMatches.push(match);

          // === rating tímov ===
          ensureTeam(match.home_team);
          ensureTeam(match.away_team);

          const hs = match.home_score;
          const as = match.away_score;

          teamRatings[match.home_team] += hs * TEAM_GOAL_POINTS - as * TEAM_GOAL_POINTS;
          teamRatings[match.away_team] += as * TEAM_GOAL_POINTS - hs * TEAM_GOAL_POINTS;

          if (hs > as) {
            teamRatings[match.home_team] += TEAM_WIN_POINTS;
            teamRatings[match.away_team] += TEAM_LOSS_POINTS;
          } else if (as > hs) {
            teamRatings[match.away_team] += TEAM_WIN_POINTS;
            teamRatings[match.home_team] += TEAM_LOSS_POINTS;
          }

          // === hráči ===
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`;
          const boxResp = await fetch(boxUrl);
          if (!boxResp.ok) continue;

          const box = await boxResp.json();
          const homePlayers = extractSkaters(box?.playerByGameStats?.homeTeam);
          const awayPlayers = extractSkaters(box?.playerByGameStats?.awayTeam);
          const allPlayers = [...homePlayers, ...awayPlayers];

          for (const p of allPlayers) {
            const name = pickPlayerName(p);
            if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;

            const goals = Number(p.goals || 0);
            const assists = Number(p.assists || 0);
            const ppGoals = Number(p.powerPlayGoals || 0);
            const toi = toiToMinutes(p.toi || p.timeOnIce || "");

            playerRatings[name] +=
              goals * GOAL_POINTS +
              assists * ASSIST_POINTS +
              ppGoals * PP_GOAL_POINTS +
              toi * TOI_POINTS_PER_MIN;
          }
        }
      } catch (err) {
        console.warn(`⚠️ Error ${day}:`, err.message);
      }
    }

    // === TOP 50 hráčov ===
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    console.log(`✅ Zápasy: ${allMatches.length} | Hráči: ${Object.keys(topPlayers).length}`);

    res.status(200).json({
      matches: allMatches,
      teamRatings,
      playerRatings: topPlayers,
    });
  } catch (err) {
    console.error("❌ Chyba pri /api/matches:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
