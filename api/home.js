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

// Bezpečne získa URL backendu
const getBaseUrl = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
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

// === AI výpočet pravdepodobnosti gólu ===
function computeGoalProbability(player, teamRating, oppRating, isHome) {
  const rPlayer = Math.tanh(((player.rating ?? 1500) - 1500) / 300);
  const rGoals = player.goals && player.gamesPlayed ? player.goals / player.gamesPlayed : 0;
  const rShots = player.shots && player.gamesPlayed ? player.shots / player.gamesPlayed / 4.5 : 0;
  const rPP = player.powerPlayGoals && player.goals ? player.powerPlayGoals / player.goals : 0;
  const rTOI = Math.min(1, (player.toi || 0) / 20);
  const rMatchup = Math.tanh((teamRating - oppRating) / 100);
  const rHome = isHome ? 0.05 : 0;

  const logit =
    -2.2 +
    0.9 * rPlayer +
    1.0 * rShots +
    0.6 * rGoals +
    0.5 * rPP +
    0.3 * rTOI +
    0.4 * rMatchup +
    0.2 * rHome;

  const p = 1 / (1 + Math.exp(-logit));
  return Math.max(0.05, Math.min(0.6, p)); // orez na 5–60 %
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
    const resp = await axios.get(scoreUrl, { timeout: 10000 });
    const data = resp.data || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

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
              timeZone: "Europe/Bratislava",
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

    // === 2️⃣ AI STRELEC DŇA ===
    let aiScorerTip = null;
    const baseUrl = getBaseUrl(req);

    try {
      const [statsResp, ratingsResp] = await Promise.all([
        axios.get(`${baseUrl}/api/statistics`, { timeout: 15000 }),
        axios.get(`${baseUrl}/api/matches`, { timeout: 15000 }),
      ]);

      const stats = statsResp.data || {};
      const teamRatings = ratingsResp.data?.teamRatings || {};
      const playerRatings = ratingsResp.data?.playerRatings || {};

      const allPlayers = [
        ...(stats.topGoals || []),
        ...(stats.topShots || []),
        ...(stats.topPowerPlayGoals || []),
      ];

      // odstráň duplicity
      const seen = new Set();
      const uniquePlayers = allPlayers.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const candidates = [];

      for (const game of games) {
        const homeRating = teamRatings[game.homeName] ?? 1500;
        const awayRating = teamRatings[game.awayName] ?? 1500;

        const homePlayers = uniquePlayers.filter((p) => p.team === game.homeCode);
        const awayPlayers = uniquePlayers.filter((p) => p.team === game.awayCode);

        for (const p of [...homePlayers, ...awayPlayers]) {
          const playerRating = playerRatings[p.name] ?? 1500;
          const prob = computeGoalProbability(
            { ...p, rating: playerRating },
            p.team === game.homeCode ? homeRating : awayRating,
            p.team === game.homeCode ? awayRating : homeRating,
            p.team === game.homeCode
          );

          candidates.push({
            ...p,
            match: `${game.homeName} vs ${game.awayName}`,
            prob,
          });
        }
      }

      // najlepší hráč podľa pravdepodobnosti
      const best = candidates.sort((a, b) => b.prob - a.prob)[0];
      if (best) {
        aiScorerTip = {
          player: best.name,
          team: best.team,
          match: best.match,
          probability: Math.round(best.prob * 100),
          headshot: best.headshot,
          goals: best.goals,
          shots: best.shots,
          powerPlayGoals: best.powerPlayGoals,
        };
      }

      console.log("🎯 AI Strelec Dňa:", aiScorerTip?.player || "n/a", aiScorerTip?.probability || 0, "%");
    } catch (err) {
      console.warn("⚠️ AI strelec dňa – zlyhal:", err.message);
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
      aiScorerTip, // 🎯 nový výstup
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
