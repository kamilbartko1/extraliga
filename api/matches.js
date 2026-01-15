// /api/matches.js
import axios from "axios";
import { Redis } from "@upstash/redis";

// Redis cache pre Vercel (ak je dostupný)
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (e) {
    console.warn("Redis initialization failed, using in-memory cache:", e.message);
  }
}

// In-memory cache fallback (pre lokálny server)
let cacheData = null;
let cacheTime = 0;
let cacheKey = "";

// === KONŠTANTY PRE RATING ===
const START_TEAM_RATING = 1500;
const TEAM_GOAL_POINTS = 10;
const TEAM_WIN_POINTS = 10;
const TEAM_LOSS_POINTS = -10;

const START_PLAYER_RATING = 1500;
const GOAL_POINTS = 50;
const PP_GOAL_POINTS = 30;
const ASSIST_POINTS = 20;
const TOI_PER_MIN = 1;

// === Pomocné funkcie ===
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

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function toiToMinutes(toi) {
  if (!toi) return 0;
  const parts = String(toi).split(":").map(Number);
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return 0;
}

// ======================================================
// SERVERLESS HANDLER – Vercel compatible
// ======================================================
export default async function handler(req, res) {
  // 🔥 OPTIMALIZÁCIA: Maximalizovaný Edge cache - 1 hodina (matches sa nemenia často)
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');

  try {
    const START_DATE = "2025-10-08";
    const TODAY = formatDate(new Date());
    const from = req.query.from || START_DATE;
    const to = req.query.to || TODAY;
    const refresh = req.query.refresh === "1";
    const key = `${from}_${to}`;
    const now = Date.now();

    // === CACHE HIT (Redis alebo in-memory) ===
    if (!refresh) {
      // Skús Redis cache
      if (redis) {
        try {
          const redisKey = `matches:${key}`;
          const cached = await redis.get(redisKey);
          if (cached) {
            const { data, timestamp } = cached;
            const age = (now - timestamp) / 1000 / 60;
            if (age < 180) { // 3 hodiny
              console.log(`⚡ Redis cache hit (${from}–${to}, ${age.toFixed(1)}min old)`);
              return res.json(data);
            }
          }
        } catch (e) {
          console.warn("Redis cache read error:", e.message);
        }
      }

      // Fallback na in-memory cache
      if (cacheData && cacheKey === key && now - cacheTime < 3 * 60 * 60 * 1000) {
        console.log(`⚡ Memory cache hit (${from}–${to})`);
        return res.json(cacheData);
      }
    }

    const days = getDaysRange(from, to);
    console.log(`🏁 Sťahujem zápasy ${days[0]} → ${days.at(-1)} (${days.length} dní)`);

    const matches = [];
    const teamRatings = {};
    const playerRatings = {};

    // === SCOREBOARD ===
    const batches = chunk(days, 4);
    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (day) => {
          const url = `https://api-web.nhle.com/v1/score/${day}`;
          const resp = await axios.get(url, { timeout: 12000 });
          const games = Array.isArray(resp.data?.games) ? resp.data.games : [];

          for (const g of games) {
            const state = String(g.gameState || "").toUpperCase();
            if (!["OFF", "FINAL"].includes(state)) continue;

            const home = g.homeTeam?.name?.default || g.homeTeam?.abbrev || "Home";
            const away = g.awayTeam?.name?.default || g.awayTeam?.abbrev || "Away";
            const hs = g.homeTeam?.score ?? 0;
            const as = g.awayTeam?.score ?? 0;

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
        if (r.status === "rejected") {
          console.warn(`⚠️ ${batch[i]}: ${r.reason?.message || r.reason}`);
        }
      });
    }

    // === BOXSCORE – HRÁČI ===
    // 🔥 OPTIMALIZÁCIA: Zvýšená konkurencia z 6 na 10 pre rýchlejšie načítanie
    const CONCURRENCY = 10;
    let index = 0;

    async function worker() {
      while (index < matches.length) {
        const i = index++;
        const game = matches[i];
        try {
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
          const resp = await axios.get(boxUrl, { timeout: 100000 });
          const box = resp.data;

          const all = [
            ...(box?.playerByGameStats?.homeTeam?.forwards || []),
            ...(box?.playerByGameStats?.homeTeam?.defense || []),
            ...(box?.playerByGameStats?.awayTeam?.forwards || []),
            ...(box?.playerByGameStats?.awayTeam?.defense || []),
          ];

          for (const p of all) {
            const name =
              p?.name?.default ||
              [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim();

            if (!name) continue;
            if (!playerRatings[name]) playerRatings[name] = START_PLAYER_RATING;

            playerRatings[name] +=
              (p.goals || 0) * GOAL_POINTS +
              (p.assists || 0) * ASSIST_POINTS +
              (p.powerPlayGoals || 0) * PP_GOAL_POINTS +
              toiToMinutes(p.toi) * TOI_PER_MIN;
          }
        } catch (err) {
          console.warn(`⚠️ boxscore ${game.id}: ${err.message}`);
        }
      }
    }

    await Promise.all(Array(CONCURRENCY).fill(0).map(worker));

    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    // === STANDINGS (SERVER → SERVER, FAIL-SAFE) ===
    let standings = [];
    try {
      const s = await axios.get(
        "https://api-web.nhle.com/v1/standings/now",
        { timeout: 10000 }
      );
      standings = Array.isArray(s.data?.standings) ? s.data.standings : [];
    } catch (e) {
      console.warn("⚠️ standings fetch failed:", e.message);
    }

    const result = {
      matches,
      teamRatings,
      playerRatings: topPlayers,
      standings,
    };

    // === ULOŽ DO CACHE ===
    if (redis) {
      try {
        const redisKey = `matches:${key}`;
        await redis.set(redisKey, { data: result, timestamp: now }, { ex: 10800 }); // 3 hodiny TTL
      } catch (e) {
        console.warn("Redis cache write error:", e.message);
      }
    }

    // Fallback in-memory cache
    cacheData = result;
    cacheKey = key;
    cacheTime = now;

    console.log(`🏒 Hotovo! Zápasy: ${matches.length}, Hráči: ${Object.keys(topPlayers).length}`);
    res.json(result);
  } catch (err) {
    console.error("❌ NHL API error:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát", detail: err.message });
  }
}
