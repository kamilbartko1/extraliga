// /api/home.js
import axios from "axios";

// Pomocná funkcia na logo tímu
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// Mapovanie skratiek na plné názvy (takto ich máš v /api/matches)
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
  UTA: "Utah Mammoth"
};

// Bezpečne získa URL backendu pre lokál + Vercel
const getBaseUrl = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
};

// ========================================================
// SERVERLESS HANDLER – kompatibilný s Vercelom
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/home] Volanie endpointu...");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    // === 1️⃣ Získanie zápasov z NHL API ===
    const resp = await axios.get(scoreUrl, { timeout: 10000 });
    const data = resp.data || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

    const games = gamesRaw.map((g) => ({
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
            hour: "2-digit",
            minute: "2-digit",
          })
        : "??:??",
      venue: g.venue?.default || "",
      status: g.gameState || "FUT",
    }));

    console.log(`✅ Načítaných zápasov: ${games.length}`);

    // === 2️⃣ AI TIP DŇA – výpočet podľa ratingov tímov ===
    let aiTip = {
      home: "N/A",
      away: "N/A",
      prediction: "Dáta sa načítavajú...",
      confidence: 0,
      odds: "-",
    };

    try {
      const baseUrl = getBaseUrl(req);
      const ratingsResp = await axios.get(`${baseUrl}/api/matches`, {
        timeout: 10000,
      });

      const teamRatings = ratingsResp.data?.teamRatings || {};
      if (!Object.keys(teamRatings).length)
        throw new Error("Žiadne ratingy tímov");

      // Pre každý zápas spočítaj skóre podľa ratingu (rating domáceho - hosťujúceho)
      const scored = games.map((g) => {
        const homeFull = CODE_TO_FULL[g.homeCode] || g.homeName;
        const awayFull = CODE_TO_FULL[g.awayCode] || g.awayName;

        const homeR = teamRatings[homeFull] || 1500;
        const awayR = teamRatings[awayFull] || 1500;

        const diff = homeR - awayR + 5; // malý bonus za domáce prostredie
        return { ...g, homeFull, awayFull, score: diff };
      });

      // Vyber zápas s najväčším ratingovým rozdielom = AI tip dňa
      const best = scored.sort((a, b) => b.score - a.score)[0];
      if (best) {
        const confidence = Math.min(95, 60 + Math.abs(best.score) / 15);
        const odds = (1 / (confidence / 100)).toFixed(2);

        aiTip = {
          home: best.homeFull,
          away: best.awayFull,
          prediction: `Výhra ${best.homeFull}`,
          confidence: Math.round(confidence),
          odds,
        };
      } else {
        aiTip.prediction = "Žiadne zápasy pre dnešný deň.";
      }
    } catch (err) {
      console.warn("⚠️ AI tip – výpočet zlyhal:", err.message);
    }

    // === 3️⃣ Mini štatistiky (zatiaľ statické) ===
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    // === 4️⃣ Odpoveď pre frontend ===
    return res.status(200).json({
      ok: true,
      date,
      count: games.length,
      matchesToday: games,
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ [/api/home] Chyba:", err.message);
    return res.status(200).json({
      ok: false,
      date: new Date().toISOString().slice(0, 10),
      error: err.message,
      matchesToday: [],
      aiTip: {
        home: "N/A",
        away: "N/A",
        prediction: "Nepodarilo sa načítať dáta.",
        confidence: 0,
        odds: "-",
      },
      stats: {
        topScorer: "-",
        bestShooter: "-",
        mostPenalties: "-",
      },
    });
  }
}
