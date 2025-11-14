// /api/home.js
import axios from "axios";

// Logo helper
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// Plné názvy
const CODE_TO_FULL = {
  ANA:"Anaheim Ducks", ARI:"Arizona Coyotes", BOS:"Boston Bruins",
  BUF:"Buffalo Sabres", CGY:"Calgary Flames", CAR:"Carolina Hurricanes",
  CHI:"Chicago Blackhawks", COL:"Colorado Avalanche",
  CBJ:"Columbus Blue Jackets", DAL:"Dallas Stars", DET:"Detroit Red Wings",
  EDM:"Edmonton Oilers", FLA:"Florida Panthers", LAK:"Los Angeles Kings",
  MIN:"Minnesota Wild", MTL:"Montréal Canadiens",
  NSH:"Nashville Predators", NJD:"New Jersey Devils",
  NYI:"New York Islanders", NYR:"New York Rangers",
  OTT:"Ottawa Senators", PHI:"Philadelphia Flyers",
  PIT:"Pittsburgh Penguins", SEA:"Seattle Kraken",
  SJS:"San Jose Sharks", STL:"St. Louis Blues",
  TBL:"Tampa Bay Lightning", TOR:"Toronto Maple Leafs",
  VAN:"Vancouver Canucks", VGK:"Vegas Golden Knights",
  WPG:"Winnipeg Jets", WSH:"Washington Capitals",
  UTA:"Utah Mammoth"
};

// Backend URL
const getBaseUrl = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
};

// Najlepší kurz
function pickBestDecimalOdd(arr = []) {
  const prio = [10, 3, 7, 9, 8, 6];
  for (const pid of prio) {
    const o = arr.find((x) => x.providerId === pid && x.value != null);
    if (!o) continue;

    const v = String(o.value).trim();
    if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v);

    if (/^[+-]\d+$/.test(v)) {
      const n = parseInt(v, 10);
      return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
    }
  }
  return null;
}

// Pravdepodobnosť gólu
function computeGoalProbability(player, teamRating, oppRating, isHome) {
  const rPlayer = Math.tanh((player.rating - 2400) / 300);
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

  return Math.max(0.05, Math.min(0.6, 1 / (1 + Math.exp(-logit))));
}

// ------------------------------------------
//  🔥 MINI-CACHE: ODPOVEĎ DO 0–1 MS
// ------------------------------------------
if (!global._HOME_CACHE) {
  global._HOME_CACHE = { time: 0, data: null };
}

export default async function handler(req, res) {
  try {
    // 🔥 1 min cache
    if (global._HOME_CACHE.data && Date.now() - global._HOME_CACHE.time < 60000) {
      return res.status(200).json(global._HOME_CACHE.data);
    }

    console.log("🔹 [/api/home] Fetchujem nové dáta…");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    // -----------------------------------------
    // 1️⃣ Získanie zápasov
    // -----------------------------------------
    const resp = await axios.get(scoreUrl, { timeout: 8000 });
    const gamesRaw = Array.isArray(resp.data?.games) ? resp.data.games : [];

    const games = gamesRaw.map((g) => {
      const homeOdds = pickBestDecimalOdd(g.homeTeam?.odds);
      const awayOdds = pickBestDecimalOdd(g.awayTeam?.odds);

      return {
        id: g.id,
        date,
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

    // -----------------------------------------
    // 2️⃣ AI Strelec dňa (bezpečný režim)
    // -----------------------------------------
    let aiScorerTip = null;

    try {
      const baseUrl = getBaseUrl(req);

      const [statsResp, ratingsResp] = await Promise.all([
        axios.get(`${baseUrl}/api/statistics`, { timeout: 8000 }),
        axios.get(`${baseUrl}/api/matches`, { timeout: 8000 }),
      ]);

      const stats = statsResp.data || {};
      const teamRatings = ratingsResp.data?.teamRatings || {};
      const playerRatings = ratingsResp.data?.playerRatings || {};

      const merged = [
        ...(stats.topGoals || []),
        ...(stats.topShots || []),
        ...(stats.topPowerPlayGoals || []),
      ];

      // odstránenie duplicít
      const seen = new Set();
      const uniquePlayers = merged.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      // mapovanie ratingu podľa viacerých tvarov mena
      function findRating(name) {
        if (!name) return 1500;
        const clean = name.toLowerCase().replace(/\./g, "").trim();
        const parts = clean.split(" ");
        const first = parts[0];
        const last = parts[1];

        const variants = [
          clean,
          `${first[0]} ${last}`,
          `${first[0]}.${last}`,
          `${first[0]}${last}`,
          last,
        ];

        for (const [key, val] of Object.entries(playerRatings)) {
          const k = key.toLowerCase().replace(/\./g, "");
          if (variants.includes(k)) return val;
        }
        return 1500;
      }

      let candidates = [];

      for (const game of games) {
        const homeR = teamRatings[game.homeName] ?? 1500;
        const awayR = teamRatings[game.awayName] ?? 1500;

        const homePlayers = uniquePlayers.filter((p) => p.team === game.homeCode);
        const awayPlayers = uniquePlayers.filter((p) => p.team === game.awayCode);

        for (const p of [...homePlayers, ...awayPlayers]) {
          const rating = findRating(p.name);

          const prob = computeGoalProbability(
            { ...p, rating },
            p.team === game.homeCode ? homeR : awayR,
            p.team === game.homeCode ? awayR : homeR,
            p.team === game.homeCode
          );

          candidates.push({
            ...p,
            match: `${game.homeName} vs ${game.awayName}`,
            prob,
          });
        }
      }

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
    } catch (err) {
      console.warn("⚠️ AI strelec – zlyhanie:", err.message);
    }

    // -----------------------------------------
    // Odpoveď
    // -----------------------------------------
    const responseOut = {
      ok: true,
      date,
      count: games.length,
      matchesToday: games,
      aiScorerTip,
      stats: {
        topScorer: "Connor McDavid – 12 gólov",
        bestShooter: "Auston Matthews – 22 %",
        mostPenalties: "Tom Wilson – 29 min",
      },
    };

    // 🔥 uložiť do cache
    global._HOME_CACHE = {
      time: Date.now(),
      data: responseOut,
    };

    return res.status(200).json(responseOut);
  } catch (err) {
    console.error("❌ [/api/home] ERROR:", err.message);

    return res.status(200).json({
      ok: false,
      date: new Date().toISOString().slice(0, 10),
      matchesToday: [],
      aiScorerTip: null,
      error: err.message,
      stats: {
        topScorer: "-",
        bestShooter: "-",
        mostPenalties: "-",
      },
    });
  }
}
