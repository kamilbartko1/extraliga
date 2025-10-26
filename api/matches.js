// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08";
    const TODAY = new Date().toISOString().slice(0, 10);
    const THREE_DAYS_AGO = new Date();
    THREE_DAYS_AGO.setDate(THREE_DAYS_AGO.getDate() - 3);

    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // 💡 rozsah pre výpočet ratingu (celá sezóna)
    const fullDateRange = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      fullDateRange.push(formatDate(new Date(d)));
    }

    // 💡 rozsah pre rýchle zobrazenie (posledné 3 dni)
    const shortDateRange = [];
    for (let d = new Date(THREE_DAYS_AGO); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      shortDateRange.push(formatDate(new Date(d)));
    }

    const allMatches = [];
    const teamRatings = {};
    const playerRatings = {};
    const datesWithGames = new Set();

    // ===== KONŠTANTY =====
    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    const START_PLAYER_RATING = 1500;
    const GOAL_POINTS = 50;
    const PP_GOAL_POINTS = 30;
    const ASSIST_POINTS = 20;
    const TOI_MIN_POINT = 1;

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

    // ⏱️ prepočet TOI na minúty
    const toiToMinutes = (toi) => {
      if (!toi) return 0;
      const parts = String(toi).split(":").map(Number);
      if (parts.length === 2) return parts[0] + parts[1] / 60;
      if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
      return 0;
    };

    // ========== 1️⃣ Výpočet ratingu hráčov (celá sezóna) ==========
    const boxscoreJobs = [];
    for (const day of fullDateRange) {
      try {
        const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        const games = data.games || [];
        for (const g of games) {
          const state = String(g.gameState || "").toUpperCase();
          if (!["FINAL", "OFF"].includes(state)) continue;

          const gameId = g.id;
          boxscoreJobs.push(
            (async () => {
              try {
                const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
                if (!r.ok) return;
                const box = await r.json();

                const homeSkaters = extractSkaters(box?.playerByGameStats?.homeTeam || {});
                const awaySkaters = extractSkaters(box?.playerByGameStats?.awayTeam || {});
                const allSkaters = [...homeSkaters, ...awaySkaters];

                for (const p of allSkaters) {
                  const name = pickPlayerName(p);
                  if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;

                  const goals = Number(p.goals || 0);
                  const assists = Number(p.assists || 0);
                  const ppGoals = Number(p.powerPlayGoals || 0);
                  const toiMin = toiToMinutes(p.toi || p.timeOnIce || "");

                  playerRatings[name] +=
                    goals * GOAL_POINTS +
                    ppGoals * PP_GOAL_POINTS +
                    assists * ASSIST_POINTS +
                    toiMin * TOI_MIN_POINT;
                }
              } catch (err) {
                console.warn(`⚠️ Boxscore error ${gameId}:`, err.message);
              }
            })()
          );
        }
      } catch (err) {
        console.warn(`⚠️ Rating fetch error ${day}:`, err.message);
      }
    }

    await Promise.allSettled(boxscoreJobs);

    // ========== 2️⃣ Načítanie zápasov (len posledné 3 dni) ==========
    for (const day of shortDateRange) {
      try {
        const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        const games = data.games || [];
        if (games.length > 0) datesWithGames.add(day);

        for (const g of games) {
          const state = String(g.gameState || "").toUpperCase();
          if (!["FINAL", "OFF", "LIVE"].includes(state)) continue;

          const match = {
            id: g.id,
            date: day,
            status: state === "LIVE" ? "ap" : "closed",
            home_team: g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home",
            away_team: g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away",
            home_score: g.homeTeam?.score ?? 0,
            away_score: g.awayTeam?.score ?? 0,
            start_time: g.startTimeUTC,
          };

          allMatches.push(match);
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
        }
      } catch (err) {
        console.warn(`⚠️ Score fetch error ${day}:`, err.message);
      }
    }

    // ========== 3️⃣ Výstup ==========
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    console.log(
      `✅ Dokončené: ${allMatches.length} zápasov | Dátumy: ${datesWithGames.size} | TOP hráči: ${Object.keys(topPlayers).length}`
    );

    res.status(200).json({
      dates: [...datesWithGames],
      matches: allMatches,
      teamRatings,
      playerRatings: topPlayers,
    });
  } catch (err) {
    console.error("❌ Chyba pri /api/matches:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
}
