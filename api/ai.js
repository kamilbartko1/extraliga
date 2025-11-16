// /api/ai.js
import { Redis } from "@upstash/redis";
import axios from "axios";

// ===============================
// 1) INIT – Upstash Redis
// ===============================
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY_HISTORY = "AI_TIPS_HISTORY";  // zoznam tipov
const KEY_LAST = "AI_LAST_TIP";         // posledný tip
const KEY_STATS = "AI_STATS";           // úspešnosť


// ===============================
// 2) POMOCNÉ FUNKCIE
// ===============================

// logo
const logo = code =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// prepočítaj americké kurzy → dec odds
function pickBestDecimalOdd(arr = []) {
  const prio = [10, 3, 7, 9, 8, 6];
  for (const id of prio) {
    const o = arr.find(x => x.providerId === id && x.value != null);
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

// AI výpočet pravdepodobnosti
function computeGoalProbability(player, teamRating, oppRating, isHome) {
  const rPlayer = Math.tanh(((player.rating) - 2400) / 300);
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


// ===============================
// 3) HLAVNÝ HANDLER
// ===============================
export default async function handler(req, res) {
  try {
    const task = req.query.task || "scorer";

    // ========================================================================
    //  TASK: GET — vráti historické tipy + úspešnosť
    // ========================================================================
    if (task === "get") {
      const history = (await redis.lrange(KEY_HISTORY, 0, -1)) || [];
      const stats = (await redis.get(KEY_STATS)) || { total: 0, hits: 0 };

      return res.json({
        ok: true,
        stats,
        count: history.length,
        history: history.map(x => JSON.parse(x)),
      });
    }

    // ========================================================================
    //  TASK: SCORE — vyhodnotenie posledného tipa (či dal gól)
    // ========================================================================
    if (task === "score") {
      const last = await redis.get(KEY_LAST);
      if (!last) return res.json({ ok: false, msg: "No last tip saved" });

      const { player, gameId } = last;
      const boxUrl = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;

      try {
        const resp = await axios.get(boxUrl);
        const box = resp.data;

        let goals = 0;
        const all = [
          ...(box.playerByGameStats.homeTeam?.forwards ?? []),
          ...(box.playerByGameStats.homeTeam?.defense ?? []),
          ...(box.playerByGameStats.awayTeam?.forwards ?? []),
          ...(box.playerByGameStats.awayTeam?.defense ?? []),
        ];

        for (const p of all) {
          const name = p?.name?.default;
          if (name && name.toLowerCase() === player.toLowerCase()) {
            goals = p.goals ?? 0;
            break;
          }
        }

        // update štatistík
        const stats = (await redis.get(KEY_STATS)) || { total: 0, hits: 0 };
        stats.total++;
        if (goals > 0) stats.hits++;
        await redis.set(KEY_STATS, stats);

        return res.json({
          ok: true,
          player,
          goals,
          successRate: !stats.total ? 0 : Math.round((stats.hits / stats.total) * 100),
        });
      } catch (err) {
        return res.json({ ok: false, error: err.message });
      }
    }

    // ========================================================================
    //  TASK: SAVE — uloží strelca dňa
    // ========================================================================
    if (task === "save") {
      const scorer = req.body?.aiScorerTip;
      if (!scorer) return res.json({ ok: false, msg: "Missing scorer" });

      await redis.set(KEY_LAST, scorer);
      await redis.lpush(KEY_HISTORY, JSON.stringify(scorer));

      return res.json({ ok: true, saved: scorer });
    }

    // ========================================================================
    //  TASK: SCORER — vypočíta AI strelca dňa (rýchle)
    // ========================================================================
    // 1 - načítaj zápasy
    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    const scoreResp = await axios.get(scoreUrl, { timeout: 8000 });
    const gamesRaw = Array.isArray(scoreResp.data.games) ? scoreResp.data.games : [];

    const games = gamesRaw.map(g => ({
      id: g.id,
      homeName: g.homeTeam?.name?.default || "",
      awayName: g.awayTeam?.name?.default || "",
      homeCode: g.homeTeam?.abbrev,
      awayCode: g.awayTeam?.abbrev,
      homeOdds: pickBestDecimalOdd(g.homeTeam?.odds || []),
      awayOdds: pickBestDecimalOdd(g.awayTeam?.odds || []),
    }));

    if (!games.length)
      return res.json({ ok: false, aiScorerTip: null });

    // 2 - načítaj štatistiky + ratingy
    const base = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    const [statsResp, ratingResp] = await Promise.all([
      axios.get(`${base}/api/statistics`, { timeout: 8000 }),
      axios.get(`${base}/api/matches`, { timeout: 8000 }),
    ]);

    const stats = statsResp.data || {};
    const teamRatings = ratingResp.data?.teamRatings || {};
    const playerRatings = ratingResp.data?.playerRatings || {};

    // výber kandidátov
    const playerPool = [
      ...(stats.topGoals || []),
      ...(stats.topShots || []),
      ...(stats.topPowerPlayGoals || []),
    ];

    const seen = new Set();
    const players = playerPool.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    if (!players.length)
      return res.json({ ok: false, aiScorerTip: null });

    // zisti rating hráča
    function findRating(name) {
      const lower = name.toLowerCase().replace(/\./g, "").trim();
      const [f, l] = lower.split(" ");
      const variants = [
        lower, `${f?.charAt(0)} ${l}`, `${f?.charAt(0)}. ${l}`, `${f?.charAt(0)}${l}`, l
      ];
      for (const [key, value] of Object.entries(playerRatings)) {
        const k = key.toLowerCase().replace(/\./g, "").trim();
        if (variants.includes(k)) return value;
      }
      return 1500;
    }

    const candidates = [];

    for (const game of games) {
      const homeR = teamRatings[game.homeName] ?? 1500;
      const awayR = teamRatings[game.awayName] ?? 1500;

      const homePlayers = players.filter(p => p.team === game.homeCode);
      const awayPlayers = players.filter(p => p.team === game.awayCode);

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
          prob,
          match: `${game.homeName} vs ${game.awayName}`,
          gameId: game.id,
        });
      }
    }

    if (!candidates.length)
      return res.json({ ok: false, aiScorerTip: null });

    // výber najlepšieho
    const best = candidates.sort((a, b) => b.prob - a.prob)[0];

    const output = {
      player: best.name,
      team: best.team,
      match: best.match,
      probability: Math.round(best.prob * 100),
      headshot: best.headshot,
      goals: best.goals,
      shots: best.shots,
      powerPlayGoals: best.powerPlayGoals,
      gameId: best.gameId,
    };

    return res.json({ ok: true, aiScorerTip: output });

  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
}
