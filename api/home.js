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
  UTA: "Utah Mammoth",
};

// Bezpečne získa URL backendu pre lokál + Vercel
const getBaseUrl = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
};

// vyber preferovaný kurz z odds poľa
function pickBestDecimalOdd(oddsArray = []) {
  // priorita: Doxxbet (10) -> Tipsport (3) -> FanDuel (7) -> DraftKings (9) -> Sportradar (8) -> Veikkaus (6)
  const prio = [10, 3, 7, 9, 8, 6];
  for (const pid of prio) {
    const o = oddsArray.find((x) => x.providerId === pid && x.value != null);
    if (o) {
      const v = String(o.value).trim();
      // ak je to decimal (1.87, 2.49, 3.05…)
      if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);
      // ak je to americký kurz (+135 / -185) → premeníme na decimal
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
// SERVERLESS HANDLER – kompatibilný s Vercelom
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/home] Volanie endpointu...");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    // === 1️⃣ Získanie zápasov z NHL API ===
    const resp = await axios.get(scoreUrl, { timeout: 7000 });
    const data = resp.data || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

    // Rozšír: zober aj kurzy (homeOdds/awayOdds)
    const games = gamesRaw.map((g) => {
      const homeOdds = pickBestDecimalOdd(g.homeTeam?.odds || []);
      const awayOdds = pickBestDecimalOdd(g.awayTeam?.odds || []);

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
              hour: "2-digit",
              minute: "2-digit",
            })
          : "??:??",
        venue: g.venue?.default || "",
        status: g.gameState || "FUT",
        homeOdds,
        awayOdds,
      };
    });

    console.log(`✅ Načítaných zápasov: ${games.length}`);

    // === 2️⃣ AI TIP DŇA – ratingy -> fallback na kurzy -> fallback na prvý zápas
    let aiTip = {
      home: "N/A",
      away: "N/A",
      prediction: "Dáta sa načítavajú...",
      confidence: 0,
      odds: "-",
    };

    // 2a) Skús podľa ratingov
    let bestByRatings = null;
    try {
      const baseUrl = getBaseUrl(req);
      const ratingsResp = await axios.get(`${baseUrl}/api/matches`, {
        timeout: 7000,
      });

      const teamRatings = ratingsResp.data?.teamRatings || {};
      if (Object.keys(teamRatings).length) {
        const scored = games.map((g) => {
          const homeFull = CODE_TO_FULL[g.homeCode] || g.homeName;
          const awayFull = CODE_TO_FULL[g.awayCode] || g.awayName;
          const homeR = teamRatings[homeFull] ?? 1500;
          const awayR = teamRatings[awayFull] ?? 1500;
          const diff = (homeR - awayR) + 5; // malé HFA
          return { ...g, homeFull, awayFull, score: diff };
        });
        bestByRatings = scored.sort((a, b) => b.score - a.score)[0] || null;
      }
    } catch (e) {
      console.warn("⚠️ AI tip (ratingy) – zlyhalo:", e.message);
    }

    // 2b) Ak ratingy nevyšli, fallback na kurzy
    let bestByOdds = null;
    if (!bestByRatings) {
      const viable = games
        .map((g) => {
          // Preferujeme favorita: menší kurz
          let pickSide = null;
          let pickOdds = null;

          if (g.homeOdds && g.awayOdds) {
            if (g.homeOdds <= g.awayOdds) {
              pickSide = "home";
              pickOdds = g.homeOdds;
            } else {
              pickSide = "away";
              pickOdds = g.awayOdds;
            }
          } else if (g.homeOdds) {
            pickSide = "home";
            pickOdds = g.homeOdds;
          } else if (g.awayOdds) {
            pickSide = "away";
            pickOdds = g.awayOdds;
          }

          return pickSide
            ? { ...g, pickSide, pickOdds }
            : null;
        })
        .filter(Boolean);

      if (viable.length) {
        // vyber najnižší kurz (najväčší favorit)
        bestByOdds = viable.sort((a, b) => a.pickOdds - b.pickOdds)[0];
      }
    }

    if (bestByRatings) {
      const confidence = Math.min(95, 60 + Math.abs(bestByRatings.score) / 15);
      // odhad "férového" kurzu z dôvery (nie je dokonalý, ale stabilný)
      const fairOdds = (1 / Math.max(0.51, confidence / 100)).toFixed(2);
      aiTip = {
        home: bestByRatings.homeFull,
        away: bestByRatings.awayFull,
        prediction: `Výhra ${bestByRatings.homeFull}`,
        confidence: Math.round(confidence),
        odds: fairOdds,
      };
    } else if (bestByOdds) {
      const isHome = bestByOdds.pickSide === "home";
      const pickName = isHome ? bestByOdds.homeName : bestByOdds.awayName;
      const odds = bestByOdds.pickOdds?.toFixed(2) ?? "-";
      // jednoduchý mapping kurzu na dôveru
      const conf = Math.max(55, Math.min(90, 120 - (bestByOdds.pickOdds * 20)));
      aiTip = {
        home: bestByOdds.homeName,
        away: bestByOdds.awayName,
        prediction: `Výhra ${pickName}`,
        confidence: Math.round(conf),
        odds,
      };
    } else if (games.length) {
      // 2c) Posledná záchrana
      const g = games[0];
      aiTip = {
        home: g.homeName,
        away: g.awayName,
        prediction: `Výhra ${g.homeName}`,
        confidence: 60,
        odds: "-",
      };
    }

    // === 3️⃣ Mini štatistiky (zatiaľ statické)
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    // === 4️⃣ Odpoveď pre frontend
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
