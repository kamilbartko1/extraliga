// /api/matches.js – optimalizovaná verzia s bezpečnými fetchmi a stabilnými ratingmi

export default async function handler(req, res) {
  try {
    const START_DATE = "2025-10-08";
    const TODAY = new Date().toISOString().slice(0, 10);

    // Pomocná funkcia pre formát dátumu
    const formatDate = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    // Vygeneruj všetky dni od začiatku sezóny po dnešok
    const dateRange = [];
    for (let d = new Date(START_DATE); d <= new Date(TODAY); d.setDate(d.getDate() + 1)) {
      dateRange.push(formatDate(new Date(d)));
    }

    // ------------------------
    // 1️⃣ Inicializácia dát
    // ------------------------
    const allMatches = [];
    const teamRatings = {};
    const playerRatings = {};

    // Konštanty
    const START_TEAM_RATING = 1500;
    const TEAM_GOAL_POINTS = 10;
    const TEAM_WIN_POINTS = 10;
    const TEAM_LOSS_POINTS = -10;

    const START_PLAYER_RATING = 1500;
    const GOAL_POINTS = 20;
    const ASSIST_POINTS = 10;

    // ------------------------
    // 2️⃣ Helper funkcie
    // ------------------------

    // Bezpečný fetch s retry
    async function safeFetch(url, retries = 3, delay = 400) {
      for (let i = 0; i < retries; i++) {
        try {
          const resp = await fetch(url);
          if (resp.ok) return await resp.json();
        } catch (err) {
          console.warn(`⚠️ Fetch chyba [${url}] (pokus ${i + 1}/${retries}):`, err.message);
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      console.error(`❌ Nepodarilo sa načítať URL po ${retries} pokusoch: ${url}`);
      return null;
    }

    // Zaistí, že tím má rating
    const ensureTeam = (name) => {
      if (name && teamRatings[name] == null) teamRatings[name] = START_TEAM_RATING;
    };

    // Vyberie meno hráča v čitateľnom formáte
    const pickPlayerName = (p) =>
      p?.name?.default ||
      [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim() ||
      "Neznámy hráč";

    // Vyberie všetkých korčuliarov z tímu
    const extractSkaters = (teamNode) => [
      ...(Array.isArray(teamNode?.forwards) ? teamNode.forwards : []),
      ...(Array.isArray(teamNode?.defense) ? teamNode.defense : []),
    ];

    // ------------------------
    // 3️⃣ Načítanie zápasov
    // ------------------------
    const boxscoreJobs = [];

    for (const day of dateRange) {
      const data = await safeFetch(`https://api-web.nhle.com/v1/score/${day}`);
      if (!data) continue;

      const games = Array.isArray(data.games) ? data.games : [];
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

        const hs = match.home_score ?? 0;
        const as = match.away_score ?? 0;

        // aktualizuj team ratings
        teamRatings[match.home_team] += hs * TEAM_GOAL_POINTS - as * TEAM_GOAL_POINTS;
        teamRatings[match.away_team] += as * TEAM_GOAL_POINTS - hs * TEAM_GOAL_POINTS;

        if (hs > as) {
          teamRatings[match.home_team] += TEAM_WIN_POINTS;
          teamRatings[match.away_team] += TEAM_LOSS_POINTS;
        } else if (as > hs) {
          teamRatings[match.away_team] += TEAM_WIN_POINTS;
          teamRatings[match.home_team] += TEAM_LOSS_POINTS;
        }

        // ✅ boxscore spracovanie len pre ukončené zápasy
        if (["FINAL", "OFF"].includes(state)) {
          const gameId = g.id;
          boxscoreJobs.push(async () => {
            const box = await safeFetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
            if (!box) return;

            const homeSkaters = extractSkaters(box?.playerByGameStats?.homeTeam || {});
            const awaySkaters = extractSkaters(box?.playerByGameStats?.awayTeam || {});
            const allSkaters = [...homeSkaters, ...awaySkaters];

            for (const p of allSkaters) {
              const name = pickPlayerName(p);
              if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;

              const goals = Number(p.goals || 0);
              const assists = Number(p.assists || 0);

              // rating += (góly * 20 + asistencie * 10)
              playerRatings[name] += goals * GOAL_POINTS + assists * ASSIST_POINTS;
            }
          });
        }
      }
    }

    // ------------------------
    // 4️⃣ Spusti boxscore joby s limitom
    // ------------------------
    const CONCURRENCY = 6;
    const runWithLimit = async (jobs, limit) => {
      const queue = [...jobs];
      const workers = Array(Math.min(limit, queue.length))
        .fill(0)
        .map(async () => {
          while (queue.length) {
            const job = queue.shift();
            try {
              await job();
            } catch (err) {
              console.warn("⚠️ Chyba jobu:", err.message);
            }
          }
        });
      await Promise.all(workers);
    };

    await runWithLimit(boxscoreJobs, CONCURRENCY);

    // ------------------------
    // 5️⃣ Výsledný rebríček
    // ------------------------
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    // Log pre kontrolu
    console.log(
      `✅ Hotovo! Zápasy: ${allMatches.length}, Tímy: ${Object.keys(teamRatings).length}, TOP hráči: ${Object.keys(topPlayers).length}`
    );

    // ------------------------
    // 6️⃣ Odošli odpoveď
    // ------------------------
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
