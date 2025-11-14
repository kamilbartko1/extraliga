// /api/home.js – fixnutá verzia pre Vercel bez /api/ratings.js
import axios from "axios";

// Logo helper
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// Plné názvy tímov
const CODE_TO_FULL = {
  ANA: "Anaheim Ducks", ARI: "Arizona Coyotes", BOS: "Boston Bruins",
  BUF: "Buffalo Sabres", CGY: "Calgary Flames", CAR: "Carolina Hurricanes",
  CHI: "Chicago Blackhawks", COL: "Colorado Avalanche",
  CBJ: "Columbus Blue Jackets", DAL: "Dallas Stars", DET: "Detroit Red Wings",
  EDM: "Edmonton Oilers", FLA: "Florida Panthers", LAK: "Los Angeles Kings",
  MIN: "Minnesota Wild", MTL: "Montréal Canadiens",
  NSH: "Nashville Predators", NJD: "New Jersey Devils",
  NYI: "New York Islanders", NYR: "New York Rangers",
  OTT: "Ottawa Senators", PHI: "Philadelphia Flyers",
  PIT: "Pittsburgh Penguins", SEA: "Seattle Kraken",
  SJS: "San Jose Sharks", STL: "St. Louis Blues",
  TBL: "Tampa Bay Lightning", TOR: "Toronto Maple Leafs",
  VAN: "Vancouver Canucks", VGK: "Vegas Golden Knights",
  WPG: "Winnipeg Jets", WSH: "Washington Capitals",
  UTA: "Utah Mammoth"
};

// Backend URL
const getBaseUrl = (req) => {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
};

// Normalizácia textu
const norm = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[.\-']/g, " ").replace(/\s+/g, " ")
  .trim().toLowerCase();

// Pravdepodobnosť gólu
function computeGoalProbability(player, teamRating, oppRating, isHome) {
  const rPlayer = Math.tanh((player.rating - 2500) / 300);
  const rGoals = player.goals && player.gamesPlayed ? player.goals / player.gamesPlayed : 0;
  const rShots = player.shots && player.gamesPlayed ? player.shots / player.gamesPlayed / 4.5 : 0;
  const rPP = player.powerPlayGoals && player.goals ? player.powerPlayGoals / player.goals : 0;
  const rTOI = Math.min(1, (player.toi || 0) / 20);
  const rMatchup = Math.tanh((teamRating - oppRating) / 100);
  const rHome = isHome ? 0.05 : 0;
  const logit = -2.2 + 0.9 * rPlayer + 1.0 * rShots + 0.6 * rGoals +
    0.5 * rPP + 0.3 * rTOI + 0.4 * rMatchup + 0.2 * rHome;
  return Math.max(0.05, Math.min(0.6, 1 / (1 + Math.exp(-logit))));
}

// Cache
if (!global._HOME_CACHE) global._HOME_CACHE = { time: 0, data: null };

// ==============================================
// ENDPOINT
// ==============================================
export default async function handler(req, res) {
  try {
    if (global._HOME_CACHE.data && Date.now() - global._HOME_CACHE.time < 60000)
      return res.status(200).json(global._HOME_CACHE.data);

    console.log("🏠 [/api/home] Spúšťam výpočet...");

    const baseUrl = getBaseUrl(req);
    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;
    const gamesResp = await axios.get(scoreUrl, { timeout: 8000 });
    const gamesRaw = Array.isArray(gamesResp.data?.games) ? gamesResp.data.games : [];

    const games = gamesRaw.map(g => ({
      id: g.id,
      date,
      homeName: g.homeTeam?.name?.default || CODE_TO_FULL[g.homeTeam?.abbrev],
      awayName: g.awayTeam?.name?.default || CODE_TO_FULL[g.awayTeam?.abbrev],
      homeLogo: g.homeTeam?.logo || logo(g.homeTeam?.abbrev),
      awayLogo: g.awayTeam?.logo || logo(g.awayTeam?.abbrev),
      homeCode: g.homeTeam?.abbrev,
      awayCode: g.awayTeam?.abbrev,
      startTime: g.startTimeUTC
        ? new Date(g.startTimeUTC).toLocaleTimeString("sk-SK", {
            timeZone: "Europe/Bratislava",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "??:??"
    }));

    // 🧠 Získaj ratingy priamo z /api/matches
    let ratings = { teamRatings: {}, playerRatings: {} };
    try {
      const r = await axios.get(`${baseUrl}/api/matches?ratingsOnly=1`, { timeout: 5000 });
      ratings = r.data;
    } catch (err) {
      console.warn("⚠️ /api/matches ratingsOnly fallback:", err.message);
    }

    const teamRatings = ratings.teamRatings || {};
    const playerRatings = ratings.playerRatings || {};

    // 📊 Ak existuje /api/statistics, pridaj štatistiky
    let stats = {};
    try {
      const s = await axios.get(`${baseUrl}/api/statistics`, { timeout: 8000 });
      stats = s.data;
    } catch {}

    // 🎯 Výpočet AI strelca dňa
    let aiScorerTip = null;

    try {
      const allPlayers = [
        ...(stats.topGoals || []),
        ...(stats.topShots || []),
        ...(stats.topPowerPlayGoals || []),
      ];

      const unique = [];
      const seen = new Set();
      for (const p of allPlayers) {
        if (!p?.name || seen.has(p.name)) continue;
        seen.add(p.name);
        unique.push(p);
      }

      let best = null;
      let maxProb = 0;

      for (const game of games) {
        const homeR = teamRatings[game.homeName] ?? 1500;
        const awayR = teamRatings[game.awayName] ?? 1500;

        for (const p of unique) {
          const clean = norm(p.name);
          const rating = playerRatings[clean] ?? playerRatings[p.name] ?? 1500;
          const prob = computeGoalProbability(
            { ...p, rating },
            homeR, awayR, true
          );
          if (prob > maxProb) {
            maxProb = prob;
            best = { ...p, match: `${game.homeName} vs ${game.awayName}`, prob };
          }
        }
      }

      if (best) {
        aiScorerTip = {
          player: best.name,
          team: best.team || "",
          match: best.match,
          probability: Math.round(best.prob * 100),
          headshot: best.headshot || "",
          goals: best.goals ?? 0,
          shots: best.shots ?? 0,
          powerPlayGoals: best.powerPlayGoals ?? 0,
        };
      }
    } catch (err) {
      console.warn("⚠️ AI výpočet zlyhal:", err.message);
    }

    const response = { ok: true, date, matchesToday: games, aiScorerTip, stats };
    global._HOME_CACHE = { time: Date.now(), data: response };
    return res.status(200).json(response);

  } catch (err) {
    console.error("❌ /api/home ERROR:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
