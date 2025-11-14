// /api/matches – TURBO optimalizovaná verzia
import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// Absolútne cesty
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));


// =========================
//  KONŠTANTY PRE RATING
// =========================
const START_TEAM_RATING = 1500;
const TEAM_GOAL_POINTS = 10;
const TEAM_WIN_POINTS = 10;
const TEAM_LOSS_POINTS = -10;

const START_PLAYER_RATING = 1500;
const GOAL_POINTS = 50;
const PP_GOAL_POINTS = 30;
const ASSIST_POINTS = 20;
const TOI_PER_MIN = 1;


// =========================
//   POMOCNÉ FUNKCIE
// =========================
const formatDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function getDaysRange(fromStr, toStr) {
  const start = new Date(fromStr);
  const end = new Date(toStr);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(formatDate(new Date(d)));
  }
  return days;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function toiToMinutes(toi) {
  if (!toi) return 0;
  const parts = String(toi).split(":").map(Number);
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return 0;
}


// =========================
//   MINI CACHE (3–10 min)
// =========================
if (!global._MATCHES_CACHE) {
  global._MATCHES_CACHE = { key: "", time: 0, data: null };
}


// ======================================================
//   ENDPOINT /api/matches (Zrýchlená verzia)
// ======================================================
app.get("/api/matches", async (req, res) => {
  try {
    const START_DATE = "2025-10-08";
    const TODAY = formatDate(new Date());
    const from = req.query.from || START_DATE;
    const to = req.query.to || TODAY;
    const refresh = req.query.refresh === "1";

    const key = `${from}_${to}`;
    const now = Date.now();

    // 🧡 CACHING: 3–10 min
    if (!refresh &&
        global._MATCHES_CACHE.key === key &&
        now - global._MATCHES_CACHE.time < 5 * 60 * 1000) {

      console.log("⚡ /api/matches – CACHE HIT");
      return res.json(global._MATCHES_CACHE.data);
    }

    console.log(`🏁 Sťahujem zápasy ${from} → ${to}`);

    const days = getDaysRange(from, to);
    const matches = [];
    const teamRatings = {};
    const playerRatings = {};

    // ================================================
    // 1️⃣ SŤAHOVANIE SCORE API (paralelne po dávkach)
    // ================================================
    const batches = chunk(days, 4);

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (day) => {
          const url = `https://api-web.nhle.com/v1/score/${day}`;
          const resp = await axios.get(url, { timeout: 9000 });
          const games = Array.isArray(resp.data?.games) ? resp.data.games : [];

          for (const g of games) {
            const state = String(g.gameState || "").toUpperCase();
            if (!["OFF", "FINAL"].includes(state)) continue;

            const home = g.homeTeam?.name?.default || g.homeTeam?.abbrev;
            const away = g.awayTeam?.name?.default || g.awayTeam?.abbrev;
            const hs = g.homeTeam?.score ?? 0;
            const as = g.awayTeam?.score ?? 0;

            // OT / SO
            let outcome = null;
            if (g.gameOutcome?.lastPeriodType === "OT") outcome = "OT";
            if (g.gameOutcome?.lastPeriodType === "SO") outcome = "SO";

            matches.push({
              id: g.id,
              date: day,
              status: "closed",
              home_team: home,
              away_team: away,
              home_score: hs,
              away_score: as,
              outcome,
            });

            // ratingy tímov
            if (!teamRatings[home]) teamRatings[home] = START_TEAM_RATING;
            if (!teamRatings[away]) teamRatings[away] = START_TEAM_RATING;

            teamRatings[home] += hs * TEAM_GOAL_POINTS - as * TEAM_GOAL_POINTS;
            teamRatings[away] += as * TEAM_GOAL_POINTS - hs * TEAM_GOAL_POINTS;

            if (hs > as) {
              teamRatings[home] += TEAM_WIN_POINTS;
              teamRatings[away] += TEAM_LOSS_POINTS;
            } else if (as > hs) {
              teamRatings[away] += TEAM_WIN_POINTS;
              teamRatings[home] += TEAM_LOSS_POINTS;
            }
          }
        })
      );

      results.forEach((r, i) => {
        if (r.status === "rejected")
          console.warn(`⚠️ batch error:`, r.reason?.message || r.reason);
      });
    }

    console.log(`📦 Zápasov celkom: ${matches.length}`);

    // ==================================================
    // 2️⃣ BOX SCORE (ultra optimalizované workery)
    // ==================================================
    const CONCURRENCY = 8;  // 🔥 zrýchlené z 6 → 8
    let index = 0;

    async function worker() {
      while (index < matches.length) {
        const i = index++;
        const game = matches[i];

        try {
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
          const r = await axios.get(boxUrl, { timeout: 15000 });

          const box = r.data;

          const homeFor = box?.playerByGameStats?.homeTeam?.forwards || [];
          const homeDef = box?.playerByGameStats?.homeTeam?.defense || [];
          const awayFor = box?.playerByGameStats?.awayTeam?.forwards || [];
          const awayDef = box?.playerByGameStats?.awayTeam?.defense || [];

          const players = [...homeFor, ...homeDef, ...awayFor, ...awayDef];

          for (const p of players) {
            const name =
              p?.name?.default ||
              `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim();

            if (!name) continue;
            if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;

            const goals = Number(p.goals || 0);
            const assists = Number(p.assists || 0);
            const ppGoals = Number(p.powerPlayGoals || 0);
            const toi = toiToMinutes(p.toi);

            playerRatings[name] +=
              goals * GOAL_POINTS +
              assists * ASSIST_POINTS +
              ppGoals * PP_GOAL_POINTS +
              toi * TOI_PER_MIN;
          }
        } catch (err) {
          console.warn(`⚠️ boxscore ${game.id} error:`, err.message);
        }
      }
    }

    // spusti paralelne workery
    await Promise.all(Array(CONCURRENCY).fill(0).map(() => worker()));

    // top hráči
    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    const result = {
      matches,
      teamRatings,
      playerRatings: topPlayers,
    };

    // uložiť do cache
    global._MATCHES_CACHE = {
      key,
      time: Date.now(),
      data: result,
    };

    console.log("🏒 /api/matches – HOTOVO!");
    return res.json(result);

  } catch (err) {
    console.error("❌ /api/matches ERROR:", err.message);
    return res.status(500).json({
      error: "Chyba pri načítaní NHL dát",
      detail: err.message,
    });
  }
});


// root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// server
app.listen(PORT, () => {
  console.log(`🏒 NHL Server beží lokálne na http://localhost:${PORT}`);
});

export default app;
