// /api/ai.js
import { Redis } from "@upstash/redis";
import axios from "axios";

export default async function handler(req, res) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const task = req.query.task || "";
  
  // 🔥 OPTIMALIZÁCIA: Edge cache podľa tasku
  // get - dlhšie cache (história), scorer - kratšie (dnešný tip)
  const cacheTime = task === "get" ? 900 : 180; // 15 min alebo 3 min
  res.setHeader('Cache-Control', `public, s-maxage=${cacheTime}, stale-while-revalidate=120`);

  // ============= BASE URL (lokál + vercel) =============
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const baseUrl = `${proto}://${host}`;


  // =====================================================
  // 🔧 NORMALIZÁCIA MIEN – funguje pre všetky formáty
  // =====================================================
  function normalizeName(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // =====================================================
  // 🔍 ZÍSKANIE GÓLOV HRÁČA Z BOXSCORE
  // =====================================================
  async function getGoalsFromBoxscore(gameId, playerName) {
    try {
      const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
      const resp = await axios.get(url, { timeout: 12000 });
      const box = resp.data;

      const normalizedTarget = normalizeName(playerName);

      const players = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];

      const found = players.find((p) => {
        const raw1 = p?.name?.default || "";
        const raw2 = `${p?.firstName?.default || ""} ${p?.lastName?.default || ""}`;

        const n1 = normalizeName(raw1);
        const n2 = normalizeName(raw2);

        // Skontrolujeme oba smery + prehodené poradie
        return (
          n1 === normalizedTarget ||
          n2 === normalizedTarget ||
          n1.split(" ").reverse().join(" ") === normalizedTarget ||
          n2.split(" ").reverse().join(" ") === normalizedTarget
        );
      });

      return found ? Number(found.goals || 0) : 0;
    } catch (err) {
      console.warn("⚠️ Boxscore error:", err.message);
      return 0;
    }
  }

  // =====================================================
  // 🔢 Výpočet pravdepodobnosti
  // =====================================================
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

    const p = 1 / (1 + Math.exp(-logit));
    return Math.max(0.05, Math.min(0.6, p));
  }

  // =====================================================
  // 📌 Nájdenie ratingu hráča podľa jeho mena
  // =====================================================
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

  // =====================================================
  // 🟩 TASK 1 — AI STRELEC DŇA
  // =====================================================
  if (task === "scorer") {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

      const scoreResp = await axios.get(scoreUrl, { timeout: 12000 });
      const gamesRaw = scoreResp.data?.games || [];

      const [statsResp, matchesResp] = await Promise.all([
        axios.get(`${baseUrl}/api/statistics`, { timeout: 15000 }),
        axios.get(`${baseUrl}/api/matches`, { timeout: 60000 }),
      ]);

      const stats = statsResp.data || {};
      const teamRatings = matchesResp.data?.teamRatings || {};
      const playerRatings = matchesResp.data?.playerRatings || {};

      const allPlayers = [
        ...(stats.topGoals || []),
        ...(stats.topShots || []),
        ...(stats.topPowerPlayGoals || []),
      ];

      // Odstránenie duplicít
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
            gameId: game.id,
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
      console.error("❌ scorer:", err.message);
      return res.json({ ok: false, error: err.message, aiScorerTip: null });
    }
  }

// =====================================================
// 🟦 TASK 2 — SAVE (AI + MANTINGAL)
// =====================================================
if (task === "save") {
  try {
    // Získaj čerstvý AI tip
    const scorerResp = await axios.get(`${baseUrl}/api/ai?task=scorer`);
    const tip = scorerResp.data?.aiScorerTip;

    if (!tip) return res.json({ ok: false, error: "No scorer" });

    // ---- PREMENÍME "Jason Robertson" → "J. Robertson" ----
    function formatShortName(fullName) {
      const parts = fullName.trim().split(" ");
      if (parts.length < 2) return fullName;
      const first = parts[0];
      const last = parts.slice(1).join(" ");
      return `${first[0].toUpperCase()}. ${last}`;
    }

    const shortName = formatShortName(tip.player);

    // ============================================
    // 1) ULOŽENIE AI_TIPS_HISTORY (bez zmien)
    // ============================================
    const aiEntry = {
      ...tip,
      player: shortName,
      actualGoals: null,
      result: "pending"
    };

    await redis.hset("AI_TIPS_HISTORY", {
      [tip.date]: JSON.stringify(aiEntry)
    });

    // ============================================
    // 2) ULOŽENIE MANTINGAL_PLAYER (BEZPEČNÉ)
    // ============================================

    // Najprv skontrolujeme, či hráč už existuje
    const existingRaw = await redis.hget("MANTINGAL_PLAYERS", shortName);

    if (!existingRaw) {
      // ❗ VYTVORÍME HRÁČA IBA PRVÝKRÁT
      const mantingaleEntry = {
        ...tip,
        player: shortName,
        actualGoals: null,
        result: "pending",

        // parametre mantingalu
        stake: 1,
        streak: 0,
        balance: 0,
        lastUpdate: null,
        started: tip.date,

        // doplníme team
        teamAbbrev: tip.team || null
      };

      await redis.hset("MANTINGAL_PLAYERS", {
        [shortName]: JSON.stringify(mantingaleEntry)
      });

      // ============================================
      // 3) Vytvoríme históriu IBA AK NEEXISTUJE !!!
      // ============================================
      const histKey = `MANTINGAL_HISTORY:${shortName}`;
      const histExists = await redis.get(histKey);

      if (!histExists) {
        await redis.set(histKey, JSON.stringify([]));
      }

      return res.json({
        ok: true,
        created: mantingaleEntry
      });
    }

    // ========================================================
    // ❗ EXISTUJÚCI HRÁČ → NIČ NEPREPÍŠEME, NIČ NEVYMAŽEME
    // ========================================================
    const existingObj = JSON.parse(existingRaw);

    return res.json({
      ok: true,
      message: "Player already exists — not overwritten",
      player: shortName,
      state: existingObj
    });

  } catch (err) {
    console.error("❌ save:", err.message);
    return res.json({ ok: false, error: err.message });
  }
}

  // =====================================================
  // 🟥 TASK 3 — UPDATE (Vyhodnotenie strelca)
  // =====================================================
  if (task === "update") {
    try {
      const tips = await redis.hgetall("AI_TIPS_HISTORY");
      const keys = Object.keys(tips).sort();
      if (keys.length === 0) return res.json({ ok: false, error: "No tips stored" });

      const lastKey = keys[keys.length - 1];

      let raw = tips[lastKey];
      if (typeof raw === "object") raw = raw.value ?? JSON.stringify(raw);

      const lastTip = JSON.parse(raw);

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
      console.error("❌ update:", err.message);
      return res.json({ ok: false, error: err.message });
    }
  }

  // =====================================================
  // 🟨 TASK 4 — GET (História + úspešnosť)
  // =====================================================
  if (task === "get") {
    try {
      const tips = await redis.hgetall("AI_TIPS_HISTORY");
      const keys = Object.keys(tips).sort();

      const list = [];

      for (const k of keys) {
        let raw = tips[k];
        if (typeof raw === "object") raw = raw.value ?? JSON.stringify(raw);

        try {
          list.push(JSON.parse(raw));
        } catch {
          console.warn("⚠️ Invalid JSON:", k, raw);
        }
      }

      const hits = list.filter((x) => x.result === "hit").length;
      const total = list.filter((x) => x.result !== "pending").length;
      const successRate = total === 0 ? 0 : Math.round((hits / total) * 100);

      return res.json({
        ok: true,
        total,
        hits,
        successRate,
        history: list.reverse(),
      });
    } catch (err) {
      console.error("❌ get:", err.message);
      return res.json({ ok: false, error: err.message });
    }
  }

  // =====================================================
  return res.json({ ok: false, error: "Unknown task" });
}