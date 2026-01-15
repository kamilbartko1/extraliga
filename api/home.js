// /api/home.js
import axios from "axios";

// Pomocná funkcia na logo tímu
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// Mapovanie skratiek na plné názvy
const CODE_TO_FULL = {
  ANA: "Anaheim Ducks",
  ARI: "Arizona Coyotes",
  BOS: "Boston Bruins",
  BUF: "Buffalo Sabres",
  CGY: "Calgary Flames",
  CAR: "Carolina Hurricanes",
  CHI: "Chicago Blackhawks",
  COL: "Colorado Avalanche",
  CBJ: "Columbus Blue Jackets",
  DAL: "Dallas Stars",
  DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers",
  FLA: "Florida Panthers",
  LAK: "Los Angeles Kings",
  MIN: "Minnesota Wild",
  MTL: "Montréal Canadiens",
  NSH: "Nashville Predators",
  NJD: "New Jersey Devils",
  NYI: "New York Islanders",
  NYR: "New York Rangers",
  OTT: "Ottawa Senators",
  PHI: "Philadelphia Flyers",
  PIT: "Pittsburgh Penguins",
  SEA: "Seattle Kraken",
  SJS: "San Jose Sharks",
  STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning",
  TOR: "Toronto Maple Leafs",
  VAN: "Vancouver Canucks",
  VGK: "Vegas Golden Knights",
  WPG: "Winnipeg Jets",
  WSH: "Washington Capitals",
  UTA: "Utah Mammoth",
};

// Pomocná funkcia – vyber najlepší kurz
function pickBestDecimalOdd(oddsArray = []) {
  const prio = [10, 3, 7, 9, 8, 6];
  for (const pid of prio) {
    const o = oddsArray.find((x) => x.providerId === pid && x.value != null);
    if (o) {
      const v = String(o.value).trim();
      if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
      if (/^[+-]\d+$/.test(v)) {
        const n = parseInt(v, 10);
        if (n > 0) return 1 + n / 100;
        if (n < 0) return 1 + 100 / Math.abs(n);
      }
    }
  }
  return null;
}

// ========================================================
// SERVERLESS HANDLER – rýchle načítanie HOME
// ========================================================
export default async function handler(req, res) {
  // 🔥 OPTIMALIZÁCIA: Zvýšený Edge cache na 15 minút (home dáta sa nemenia tak často)
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=300');

  try {
    console.log("🔹 [/api/home] Rýchle načítanie...");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    // 1️⃣ Iba DNEŠNÉ ZÁPASY (rýchle)
    const resp = await axios.get(scoreUrl, { timeout: 10000 });
    const data = resp.data || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

    // 🔥 Načítaj kurzy z partner-game API
    let oddsMap = {};
    try {
      const oddsUrl = "https://api-web.nhle.com/v1/partner-game/SK/now";
      const oddsResp = await axios.get(oddsUrl, { timeout: 10000 });
      const oddsData = oddsResp.data || {};

      if (oddsData.games && Array.isArray(oddsData.games)) {
        oddsData.games.forEach(game => {
          const gameId = game.gameId;
          const homeOdds = game.homeTeam?.odds || [];
          const awayOdds = game.awayTeam?.odds || [];
          const allOdds = [...homeOdds, ...awayOdds];

          // Nájdi 3-way kurzy (MONEY_LINE_3_WAY - domáci, remíza, hostia)
          const home3Way = allOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier !== "Draw" &&
              (o.qualifier === "" || !o.qualifier);
          });
          const draw3Way = allOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier === "Draw";
          });
          const away3Way = allOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier !== "Draw" &&
              (o.qualifier === "" || !o.qualifier);
          });

          // Home kurz je v homeTeam, away kurz je v awayTeam
          const home3WayFromHome = homeOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier !== "Draw" &&
              (o.qualifier === "" || !o.qualifier);
          });
          const away3WayFromAway = awayOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier !== "Draw" &&
              (o.qualifier === "" || !o.qualifier);
          });
          const drawFromAny = allOdds.find(o => {
            return o.description === "MONEY_LINE_3_WAY" &&
              o.qualifier === "Draw";
          });

          oddsMap[gameId] = {
            home: home3WayFromHome ? Number(home3WayFromHome.value) : null,
            draw: drawFromAny ? Number(drawFromAny.value) : null,
            away: away3WayFromAway ? Number(away3WayFromAway.value) : null
          };
        });
      }
    } catch (err) {
      console.warn("⚠️ Kurzy sa nepodarilo načítať:", err.message);
    }

    const games = gamesRaw.map((g) => {
      const homeOdds = pickBestDecimalOdd(g.homeTeam?.odds || []);
      const awayOdds = pickBestDecimalOdd(g.awayTeam?.odds || []);

      // Pridaj 3-way kurzy z oddsMap
      const gameOdds = oddsMap[g.id] || {};

      return {
        id: g.id,
        date: g.gameDate || date,
        homeName: g.homeTeam?.name?.default || "Domáci",
        awayName: g.awayTeam?.name?.default || "Hostia",
        homeLogo: g.homeTeam?.logo || logo(g.homeTeam?.abbrev),
        awayLogo: g.awayTeam?.logo || logo(g.awayTeam?.abbrev),
        homeCode: g.homeTeam?.abbrev || "",
        awayCode: g.awayTeam?.abbrev || "",
        startTime: g.startTimeUTC
          ? new Date(g.startTimeUTC).toLocaleTimeString("sk-SK", {
            timeZone: "Europe/Bratislava",
            hour: "2-digit",
            minute: "2-digit",
          })
          : "??:??",
        venue: g.venue?.default || "",
        status: g.gameState || "FUT",
        homeOdds,
        awayOdds,
        home3Way: gameOdds.home || null,
        draw3Way: gameOdds.draw || null,
        away3Way: gameOdds.away || null,
      };
    });

    console.log(`✅ Okamžite načítaných zápasov: ${games.length}`);

    // 2️⃣ AI strelca sem NEDÁVAME → doplní ho /api/ai-scorer z app.js
    const aiScorerTip = null;

    // 3️⃣ Mini štatistiky (placeholder)
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    return res.status(200).json({
      ok: true,
      date,
      count: games.length,
      matchesToday: games,
      aiScorerTip,
      stats,
    });

  } catch (err) {
    console.error("❌ [/api/home] Chyba:", err.message);

    return res.status(200).json({
      ok: false,
      date: new Date().toISOString().slice(0, 10),
      error: err.message,
      matchesToday: [],
      aiScorerTip: null,
      stats: {
        topScorer: "-",
        bestShooter: "-",
        mostPenalties: "-",
      },
    });
  }
}
