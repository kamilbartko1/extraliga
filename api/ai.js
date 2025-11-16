// /api/ai.js
import { Redis } from "@upstash/redis";
import axios from "axios";

export default async function handler(req, res) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const task = req.query.task || "";

  // Pomocná funkcia – skóre hráča z boxscore
  async function getGoalsFromBoxscore(gameId, playerName) {
    try {
      const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
      const resp = await axios.get(url, { timeout: 12000 });
      const box = resp.data;

      const teams = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];

      const found = teams.find(
        (p) =>
          (p?.name?.default ||
            `${p?.firstName?.default} ${p?.lastName?.default}`) === playerName
      );

      return found ? Number(found.goals || 0) : 0;
    } catch (err) {
      console.warn("⚠️ Boxscore error:", err.message);
      return 0;
    }
  }

  // Pomocná funkcia – prepočet pravdepodobnosti
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

    const p = 1 / (1 + Math.exp(-logit));
    return Math.max(0.05, Math.min(0.6, p)); // orez 5–60 %
  }

  // Pomocná – nájde hráča v playerRatings podľa tvaru mena
  function findPlayerRating(playerName, playerRatings) {
    if (!playerName) return 1500;
    const lower = playerName.toLowerCase().trim();
    const clean = lower.replace(/\./g, "");
    const [first, last] = clean.split(" ");

    const variants = [
      clean,
      `${first?.charAt(0)} ${last}`,
      `${first?.charAt(0)}. ${last}`,
      `${first?.charAt(0)}${last}`,
      last,
    ].filter(Boolean);

    for (const [key, rating] of Object.entries(playerRatings)) {
      const keyLower = key.toLowerCase().replace(/\./g, "").trim();
      if (variants.some((v) => keyLower === v)) return rating;
    }
    return 1500;
  }

  // ======================================================
  // 🟩 TASK 1: AI STRELEC DŇA
  // ======================================================
  if (task === "scorer") {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

      // načítaj dnešné zápasy
      const scoreResp = await axios.get(scoreUrl, { timeout: 12000 });
      const gamesRaw = scoreResp.data?.games || [];

      const homeResp = await axios.get(`${req.headers.host.includes("localhost") ? "http://" : "https://"}${req.headers.host}/api/home`);
      const statsResp = await axios.get(`${req.headers.host.includes("localhost") ? "http://" : "https://"}${req.headers.host}/api/statistics`);
      const matchesResp = await axios.get(`${req.headers.host.includes("localhost") ? "http://" : "https://"}${req.headers.host}/api/matches`);

      const stats = statsResp.data || {};
      const teamRatings = matchesResp.data?.teamRatings || {};
      const playerRatings = matchesResp.data?.playerRatings || {};

      const allPlayers = [
        ...(stats.topGoals || []),
        ...(stats.topShots || []),
        ...(stats.topPowerPlayGoals || []),
      ];

      const seen = new Set();
      const uniquePlayers = allPlayers.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      const games = gamesRaw.map((g) => ({
        id: g.id,
        homeName: g.homeTeam?.name?.default,
        awayName: g.awayTeam?.name?.default,
        homeCode: g.homeTeam?.abbrev,
        awayCode: g.awayTeam?.abbrev,
      }));

      const candidates = [];

      for (const game of games) {
        const homeR = teamRatings[game.homeName] || 1500;
        const awayR = teamRatings[game.awayName] || 1500;

        const homePlayers = uniquePlayers.filter((p) => p.team === game.homeCode);
        const awayPlayers = uniquePlayers.filter((p) => p.team === game.awayCode);

        for (const p of [...homePlayers, ...awayPlayers]) {
          const r = findPlayerRating(p.name, playerRatings);

          const prob = computeGoalProbability(
            { ...p, rating: r },
            p.team === game.homeCode ? homeR : awayR,
            p.team === game.homeCode ? awayR : homeR,
            p.team === game.homeCode
          );

          candidates.push({
            ...p,
            match: `${game.homeName} vs ${game.awayName}`,
            prob,
            gameId: game.id
          });
        }
      }

      const best = candidates.sort((a, b) => b.prob - a.prob)[0];

      if (!best) return res.json({ ok: false, aiScorerTip: null });

      return res.json({
        ok: true,
        aiScorerTip: {
          date,
          player: best.name,
          team: best.team,
          match: best.match,
          gameId: best.gameId,
          probability: Math.round(best.prob * 100),
          goals: best.goals,
          shots: best.shots,
          powerPlayGoals: best.powerPlayGoals,
          headshot: best.headshot,
        },
      });
    } catch (err) {
      return res.json({ ok: false, error: err.message, aiScorerTip: null });
    }
  }

  // ======================================================
  // 🟦 TASK 2: ULOŽENIE AI STRELCA DO REDIS
  // ======================================================
  if (task === "save") {
    try {
      const scorerResp = await axios.get(`${req.headers.host.includes("localhost") ? "http://" : "https://"}${req.headers.host}/api/ai?task=scorer`);
      const tip = scorerResp.data?.aiScorerTip;

      if (!tip) return res.json({ ok: false, error: "No scorer" });

      await redis.hset("AI_TIPS_HISTORY", {
        [tip.date]: JSON.stringify({
          ...tip,
          actualGoals: null,
          result: "pending",
        }),
      });

      return res.json({ ok: true, saved: tip });
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  }

  // ======================================================
  // 🟥 TASK 3: UPDATE – VYHODNOTENIE POSLEDNÉHO TIPU
  // ======================================================
  if (task === "update") {
    try {
      const tips = await redis.hgetall("AI_TIPS_HISTORY");
      const keys = Object.keys(tips).sort();
      if (keys.length === 0) return res.json({ ok: false, error: "No tips" });

      const lastKey = keys[keys.length - 1];
      const lastTip = JSON.parse(tips[lastKey]);

      const goals = await getGoalsFromBoxscore(lastTip.gameId, lastTip.player);

      const result = goals > 0 ? "hit" : "miss";

      const updated = {
        ...lastTip,
        actualGoals: goals,
        result,
      };

      await redis.hset("AI_TIPS_HISTORY", {
        [lastKey]: JSON.stringify(updated),
      });

      return res.json({ ok: true, updated });
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  }

  // ======================================================
  // 🟨 TASK 4: GET – ŠTATISTIKY AI
  // ======================================================
  if (task === "get") {
    try {
      const tips = await redis.hgetall("AI_TIPS_HISTORY");
      const dates = Object.keys(tips).sort();

      const list = dates.map((d) => JSON.parse(tips[d]));

      let hits = list.filter((x) => x.result === "hit").length;
      let total = list.filter((x) => x.result !== "pending").length;
      let successRate = total === 0 ? 0 : Math.round((hits / total) * 100);

      return res.json({
        ok: true,
        total,
        hits,
        successRate,
        history: list.reverse(),
      });
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  }

  return res.json({ ok: false, error: "Unknown task" });
}
