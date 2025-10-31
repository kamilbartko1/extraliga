// /api/matches.js
// server.js
import express from "express";
import axios from "axios";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// === Absolútne cesty pre ES Modules ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === Middleware ===
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"))); // ✅ frontend = public

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

// === Cache (na 3 h) ===
let cacheData = null;
let cacheTime = 0;
let cacheKey = "";

// ======================================================
// ENDPOINT: /api/matches
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

    if (!refresh && cacheData && cacheKey === key && now - cacheTime < 3 * 60 * 60 * 1000) {
      console.log(`⚡ Cache hit (${from}–${to})`);
      return res.json(cacheData);
    }

    const days = getDaysRange(from, to);
    console.log(`🏁 Sťahujem zápasy ${days[0]} → ${days.at(-1)} (${days.length} dní)`);

    const matches = [];
    const teamRatings = {};
    const playerRatings = {};

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

            matches.push({
              id: g.id,
              date: day,
              status: "closed",
              home_team: home,
              away_team: away,
              home_score: hs,
              away_score: as,
            });

            // rating tímov
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
          console.warn(`⚠️ ${batch[i]}: ${r.reason?.message || r.reason}`);
      });
    }

    console.log(`✅ Zápasov: ${matches.length} | počítam hráčov...`);

    // === Boxscore rating hráčov (limit 6 paralelne) ===
    const CONCURRENCY = 6;
    let index = 0;

    async function worker() {
      while (index < matches.length) {
        const i = index++;
        const game = matches[i];
        try {
          const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`;
          const resp = await axios.get(boxUrl, { timeout: 100000 });
          const box = resp.data;

          const homePlayers = Array.isArray(box?.playerByGameStats?.homeTeam?.forwards)
            ? box.playerByGameStats.homeTeam.forwards
            : [];
          const homeDef = Array.isArray(box?.playerByGameStats?.homeTeam?.defense)
            ? box.playerByGameStats.homeTeam.defense
            : [];
          const awayPlayers = Array.isArray(box?.playerByGameStats?.awayTeam?.forwards)
            ? box.playerByGameStats.awayTeam.forwards
            : [];
          const awayDef = Array.isArray(box?.playerByGameStats?.awayTeam?.defense)
            ? box.playerByGameStats.awayTeam.defense
            : [];

          const all = [...homePlayers, ...homeDef, ...awayPlayers, ...awayDef];

          for (const p of all) {
            const name =
              p?.name?.default ||
              [p?.firstName?.default, p?.lastName?.default].filter(Boolean).join(" ").trim();
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
          console.warn(`⚠️ boxscore ${game.id}: ${err.message}`);
        }
      }
    }

    const workers = Array(CONCURRENCY).fill(0).map(() => worker());
    await Promise.all(workers);

    const topPlayers = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .reduce((acc, [name, rating]) => {
        acc[name] = Math.round(rating);
        return acc;
      }, {});

    const result = { matches, teamRatings, playerRatings: topPlayers };
    cacheData = result;
    cacheKey = key;
    cacheTime = Date.now();

    // ======================================================
// ENDPOINT: /api/mantingal
// ======================================================
import fetch from "node-fetch"; // pridaj hore, ak ešte nemáš

app.get("/api/mantingal", async (req, res) => {
  try {
    const FIXED_ODDS = 2.2;
    const BASE_STAKE = 1;

    console.log("🏁 Spúšťam Mantingal výpočet...");

    // 1️⃣ Získaj top10 hráčov z /api/matches
    const matchesResp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
    if (!matchesResp.ok) throw new Error("Nepodarilo sa načítať zápasy");
    const matchesData = await matchesResp.json();
    const playerRatings = matchesData.playerRatings || {};

    const top10 = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => ({
        name,
        stake: BASE_STAKE,
        profit: 0,
        streak: 0,
        lastResult: "-",
      }));

    // 2️⃣ Zisti včerajší dátum
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    // 3️⃣ Načítaj zápasy z včerajška
    const scoreResp = await fetch(`https://api-web.nhle.com/v1/score/${dateStr}`);
    if (!scoreResp.ok) throw new Error("Nepodarilo sa načítať včerajšie zápasy");
    const scoreData = await scoreResp.json();
    const games = Array.isArray(scoreData.games) ? scoreData.games : [];

    // 4️⃣ Získaj strelcov z boxscore
    const scorers = new Set();
    const playedPlayers = new Set();

    for (const g of games) {
      if (!g.id) continue;
      try {
        const boxResp = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
        if (!boxResp.ok) continue;
        const box = await boxResp.json();

        const players = [
          ...(box?.playerByGameStats?.homeTeam?.forwards || []),
          ...(box?.playerByGameStats?.homeTeam?.defense || []),
          ...(box?.playerByGameStats?.awayTeam?.forwards || []),
          ...(box?.playerByGameStats?.awayTeam?.defense || []),
        ];

        for (const p of players) {
          const nm = String(p.name?.default || "").toLowerCase().trim();
          if (!nm) continue;
          playedPlayers.add(nm);
          if (p.goals && p.goals > 0) scorers.add(nm);
        }
      } catch (err) {
        console.warn(`⚠️ Boxscore ${g.id}: ${err.message}`);
      }
    }

    // 5️⃣ Vyhodnoť Mantingal logiku
    let totalProfit = 0;

    for (const player of top10) {
      const clean = player.name.toLowerCase();
      const played = Array.from(playedPlayers).some(
        (p) => p.includes(clean) || clean.includes(p)
      );
      const scored = Array.from(scorers).some(
        (s) => s.includes(clean) || clean.includes(s)
      );

      if (!played) {
        player.lastResult = "skip";
        player.stake = BASE_STAKE;
        continue;
      }

      if (scored) {
        const win = player.stake * (FIXED_ODDS - 1);
        player.profit += win;
        player.lastResult = "win";
        player.stake = BASE_STAKE;
        totalProfit += win;
      } else {
        player.profit -= player.stake;
        player.lastResult = "loss";
        player.stake *= 2;
        totalProfit -= player.stake;
      }
    }

    res.json({
      ok: true,
      dateChecked: dateStr,
      totalGames: games.length,
      scorers: scorers.size,
      players: top10,
      totalProfit: totalProfit.toFixed(2),
    });
  } catch (err) {
    console.error("Mantingal chyba:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

    console.log(`🏒 Hotovo! Zápasy: ${matches.length}, Hráči: ${Object.keys(topPlayers).length}`);
    res.json(result);
  } catch (err) {
    console.error("❌ NHL API error:", err.message);
    res.status(500).json({ error: "Chyba pri načítaní NHL dát", detail: err.message });
  }
});

// ======================================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ======================================================
app.listen(PORT, () => {
  console.log(`🏒 NHL Server beží lokálne na http://localhost:${PORT}`);
});

export default app;
