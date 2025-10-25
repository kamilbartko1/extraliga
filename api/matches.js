// /api/matches.js
export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08"; // začiatok sezóny
    const TODAY = new Date().toISOString().slice(0, 10);

    // 💡 zobrazíme len posledné 3 dni zápasov
    const THREE_DAYS_AGO = new Date();
    THREE_DAYS_AGO.setDate(THREE_DAYS_AGO.getDate() - 3);

    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const dateRangeFull = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRangeFull.push(formatDate(new Date(d)));
    }

    const dateRangeShort = [];
    for (let d = new Date(THREE_DAYS_AGO); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRangeShort.push(formatDate(new Date(d)));
    }

    const allMatches = [];
    const teamRatings = {};
    const playerRatings = {};

    // ===== KONŠTANTY =====
    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    // ===== PLAYER RATING CONFIG =====
    const START_PLAYER_RATING = 1500;
    const POINTS_GOAL = 50;
    const POINTS_PP_GOAL = 30;
    const POINTS_ASSIST = 20;
    const POINTS_TOI_MIN = 1;

    // ===== Pomocné funkcie =====
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

    // helper: prepočítať TOI (napr. "12:19" alebo "1:02:45") na minúty
    const toiToMinutes = (toi) => {
      if (!toi) return 0;
      const parts = String(toi).split(":").map(Number);
      if (parts.length === 2) return parts[0] + parts[1] / 60; // mm:ss
      if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // hh:mm:ss
      return 0;
    };

    // ==================== 1️⃣ načítanie zápasov pre RATING (celá sezóna) ====================
    const boxscorePromises = [];

    for (const day of dateRangeFull) {
      const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const games = data.games || [];

      for (const g of games) {
        const state = String(g.gameState || "").toUpperCase();
        if (!["FINAL", "OFF"].includes(state)) continue;

        const gameId = g.id;
        boxscorePromises.push(
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
                  goals * POINTS_GOAL +
                  assists * POINTS_ASSIST +
                  ppGoals * POINTS_PP_GOAL +
                  toiMin * POINTS_TOI_MIN;
              }
            } catch (err) {
              console.warn(`⚠️ Boxscore error ${gameId}:`, err.message);
            }
          })()
        );
      }
    }

    // ===== počkaj na všetky ratingové fetchy =====
    await Promise.allSettled(boxscorePromises);

    // ==================== 2️⃣ načítanie zápasov pre zobrazenie (len posledné 3 dni) ====================
    for (const day of dateRangeShort) {
      try {
        const resp = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        const games = data.games || [];

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
        console.warn(`⚠️ Score fetch error for ${day}:`, err.message);
      }
    }

    // ==================== 3️⃣ výstup ====================
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    console.log(
      `✅ Dokončené: ${allMatches.length} zápasov (posledné 3 dni) | Hráči v ratingu: ${Object.keys(playerRatings).length}`
    );

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
