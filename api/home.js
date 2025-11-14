// /api/home.js – ultra rýchla verzia s využitím /api/ratings
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

// helper: reverse FULL->CODE
const FULL_TO_CODE = Object.fromEntries(
  Object.entries(CODE_TO_FULL).map(([code, full]) => [full.toLowerCase(), code])
);

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
    const o = arr?.find?.((x) => x?.providerId === pid && x?.value != null);
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

// --- normalizácia textu (bez diakritiky, bodiek, pomlčiek, viac medzier) ---
function normTxt(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Pravdepodobnosť gólu – NEUPRAVENÁ
function computeGoalProbability(player, teamRating, oppRating, isHome) {
  const rPlayer = Math.tanh((player.rating - 2500) / 300);
  const rGoals =
    player.goals && player.gamesPlayed ? player.goals / player.gamesPlayed : 0;
  const rShots =
    player.shots && player.gamesPlayed
      ? player.shots / player.gamesPlayed / 4.5
      : 0;
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

// ---------------------------------------------------
//  🔥 MINI CACHE 60s – Home je okamžitý
// ---------------------------------------------------
if (!global._HOME_CACHE) {
  global._HOME_CACHE = { time: 0, data: null };
}

// ======================================================
//                 ENDPOINT /api/home
// ======================================================
export default async function handler(req, res) {
  try {
    // ⏱ 1 MINÚTOVÝ CACHE
    if (global._HOME_CACHE.data &&
        Date.now() - global._HOME_CACHE.time < 60000) {
      return res.status(200).json(global._HOME_CACHE.data);
    }

    console.log("🔹 [/api/home] Fetchujem rýchle dáta…");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;
    const baseUrl = getBaseUrl(req);

    // 1️⃣ Dnešné zápasy
    const resp = await axios.get(scoreUrl, { timeout: 8000 });
    const gamesRaw = Array.isArray(resp.data?.games) ? resp.data.games : [];

    const games = gamesRaw.map((g) => {
      const homeOdds = pickBestDecimalOdd(g.homeTeam?.odds);
      const awayOdds = pickBestDecimalOdd(g.awayTeam?.odds);

      return {
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
              minute: "2-digit",
            })
          : "??:??",
        homeOdds,
        awayOdds,
      };
    });

    // ✅ zoznam kódov tímov zapojených dnes (kvôli filtrovaným kandidátom)
    const todaysCodes = new Set(
      games.flatMap((g) => [g.homeCode, g.awayCode]).filter(Boolean)
    );

    // 2️⃣ Ratingy zo super-rýchleho endpointu
    let ratings = null;
    try {
      const r = await axios.get(`${baseUrl}/api/ratings`, { timeout: 3000 });
      ratings = r.data;
    } catch {
      ratings = { teamRatings: {}, playerRatings: {} };
    }

    const teamRatings = ratings.teamRatings || {};
    const playerRatings = ratings.playerRatings || {};

    // 🔧 priprava: rýchla mapa normalizovaných mien -> rating
    const playerRatingMap = new Map();
    for (const [name, r] of Object.entries(playerRatings)) {
      const k = normTxt(name);
      if (!playerRatingMap.has(k)) playerRatingMap.set(k, r);
      // pridať aj variant "F LAST" ak ide o 2+ slovné meno
      const parts = k.split(" ");
      if (parts.length >= 2) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        playerRatingMap.set(`${first[0]} ${last}`, r);
        playerRatingMap.set(`${first[0]}${last}`, r);
      }
    }

    // pomocník: nájsť rating pre meno z /api/statistics
    function findRating(name) {
      if (!name) return 1500;
      const clean = normTxt(name);
      const parts = clean.split(" ").filter(Boolean);
      const first = parts[0] || "";
      const last = parts[parts.length - 1] || "";

      const tries = [
        clean,
        `${first} ${last}`,
        `${first[0] || ""} ${last}`,
        `${first[0] || ""}${last}`,
        last,
      ].filter(Boolean);

      for (const t of tries) {
        if (playerRatingMap.has(t)) return playerRatingMap.get(t);
      }
      return 1500;
    }

    // pomocník: nájsť team rating podľa FULL alebo cez CODE→FULL
    function getTeamRatingByNameOrCode(fullNameMaybe, codeMaybe) {
      const direct = teamRatings[fullNameMaybe];
      if (typeof direct === "number") return direct;

      const code = codeMaybe || FULL_TO_CODE[normTxt(fullNameMaybe)] || "";
      if (code && CODE_TO_FULL[code]) {
        const full = CODE_TO_FULL[code];
        const val = teamRatings[full];
        if (typeof val === "number") return val;
      }
      // fallback pri odchýlkach v diakritike
      const wanted = normTxt(fullNameMaybe);
      for (const [k, v] of Object.entries(teamRatings)) {
        if (normTxt(k) === wanted) return v;
      }
      return 1500;
    }

    // 3️⃣ Štatistiky
    let stats = {};
    try {
      const s = await axios.get(`${baseUrl}/api/statistics`, { timeout: 8000 });
      stats = s.data;
    } catch {
      stats = {};
    }

    // 4️⃣ Výpočet AI strelca dňa – bez zmeny tvojej logiky, len robustnejší výber kandidátov
    let aiScorerTip = null;

    try {
      const merged = [
        ...(Array.isArray(stats.topGoals) ? stats.topGoals : []),
        ...(Array.isArray(stats.topShots) ? stats.topShots : []),
        ...(Array.isArray(stats.topPowerPlayGoals) ? stats.topPowerPlayGoals : []),
      ];

      // odstrániť duplicity (podľa id alebo mena)
      const seen = new Set();
      const uniquePlayers = merged.filter((p) => {
        const key = p?.id || p?.name;
        if (!key) return false;
        const k = String(key);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // kandidáti iba z dnešných tímov
      const todaysPlayers = uniquePlayers.filter((p) => p?.team && todaysCodes.has(p.team));

      let candidates = [];

      if (todaysPlayers.length) {
        for (const game of games) {
          const homeR = getTeamRatingByNameOrCode(game.homeName, game.homeCode);
          const awayR = getTeamRatingByNameOrCode(game.awayName, game.awayCode);

          const homePlayers = todaysPlayers.filter((p) => p.team === game.homeCode);
          const awayPlayers = todaysPlayers.filter((p) => p.team === game.awayCode);

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
      }

      // 🔁 Fallback: ak z /api/statistics neprišli hráči z dnešných tímov,
      // zober top hráčov z playerRatings a sparuj ich k dnešným zápasom podľa kódu tímu v mene (ak sa dá),
      // alebo ich rovno priraď k obom zápasom, kde tím sedí podľa CODE_TO_FULL.
      if (!candidates.length && Object.keys(playerRatings).length && games.length) {
        // vyrob si TOP 100 podľa ratingu
        const topByRating = Object.entries(playerRatings)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 100)
          .map(([name, rating]) => ({ name, rating }));

        // skúsiť nájsť kód tímu z názvu zápasov (FULL->CODE mapa)
        const fullToCodeLoose = new Map(Object.entries(FULL_TO_CODE)); // keys sú lower-case
        const todaysFullNames = new Set(
          games.flatMap(g => [g.homeName, g.awayName].map(n => String(n || "").toLowerCase()))
        );

        for (const game of games) {
          const homeR = getTeamRatingByNameOrCode(game.homeName, game.homeCode);
          const awayR = getTeamRatingByNameOrCode(game.awayName, game.awayCode);

          for (const pr of topByRating) {
            // použijeme len meno+rating, ostatné štatistiky budú 0 (neovplyvní to zásadne model)
            const prob = computeGoalProbability(
              { name: pr.name, rating: pr.rating, goals: 0, shots: 0, powerPlayGoals: 0, gamesPlayed: 0, toi: 0 },
              homeR, awayR, true
            );
            candidates.push({
              name: pr.name,
              team: "", // nevieme spoľahlivo tím z mena – nezobrazujeme v zátvorke
              headshot: "",
              goals: 0,
              shots: 0,
              powerPlayGoals: 0,
              match: `${game.homeName} vs ${game.awayName}`,
              prob,
            });
          }
        }
      }

      // finálny výber
      const best = candidates.sort((a, b) => b.prob - a.prob)[0];

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
      console.warn("⚠️ AI strelec – chyba:", err.message);
    }

    // -----------------------------------------
    // HOTOVÉ
    // -----------------------------------------
    const responseOut = {
      ok: true,
      date,
      matchesToday: games,
      aiScorerTip,
      stats: stats,
    };

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
      stats: {},
    });
  }
}
