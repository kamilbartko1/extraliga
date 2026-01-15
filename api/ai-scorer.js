// /api/ai-scorer.js
import axios from "axios";

export default async function handler(req, res) {
  // 🔥 OPTIMALIZÁCIA: AI scorer - cache 5 minút (denný tip sa mení raz za deň)
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=120');
  
  try {
    console.log("🎯 [/api/ai-scorer] Výpočet AI strelca...");

    const baseUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;

    // 1️⃣ Načítaj dáta
    const [statsResp, ratingsResp, homeResp] = await Promise.all([
      axios.get(`${baseUrl}/api/statistics`, { timeout: 10000 }),
      axios.get(`${baseUrl}/api/matches`, { timeout: 10000 }),
      axios.get(`${baseUrl}/api/home`, { timeout: 10000 })
    ]);

    const stats = statsResp.data || {};
    const teamRatings = ratingsResp.data?.teamRatings || {};
    const playerRatings = ratingsResp.data?.playerRatings || {};
    const games = homeResp.data?.matchesToday || [];

    // 2️⃣ Priprav hráčov
    const allPlayers = [
      ...(stats.topGoals || []),
      ...(stats.topShots || []),
      ...(stats.topPowerPlayGoals || [])
    ];

    // odstránenie duplicít
    const seen = new Set();
    const uniquePlayers = allPlayers.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // 3️⃣ Funkcia: nájdi rating hráča
    function findPlayerRating(name) {
      if (!name) return 1500;
      const clean = name.toLowerCase().replace(/\./g, "").trim();
      const [first, last] = clean.split(" ");

      const variants = [
        clean,
        `${first?.charAt(0)} ${last}`,
        `${first?.charAt(0)}. ${last}`,
        `${first?.charAt(0)}${last}`,
        last
      ].filter(Boolean);

      for (const [key, rating] of Object.entries(playerRatings)) {
        const keyLower = key.toLowerCase().replace(/\./g, "");
        if (variants.some(v => keyLower === v)) return rating;
      }
      return 1500;
    }

    // 4️⃣ Výpočet AI pravdepodobnosti
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
      return Math.max(0.05, Math.min(0.6, p));
    }

    // 5️⃣ Hľadanie najlepšieho hráča
    const candidates = [];

    for (const game of games) {
      const homeRating = teamRatings[game.homeName] ?? 1500;
      const awayRating = teamRatings[game.awayName] ?? 1500;

      const homePlayers = uniquePlayers.filter(p => p.team === game.homeCode);
      const awayPlayers = uniquePlayers.filter(p => p.team === game.awayCode);

      for (const p of [...homePlayers, ...awayPlayers]) {
        const pr = findPlayerRating(p.name);
        const prob = computeGoalProbability(
          { ...p, rating: pr },
          p.team === game.homeCode ? homeRating : awayRating,
          p.team === game.homeCode ? awayRating : homeRating,
          p.team === game.homeCode
        );

        candidates.push({
          ...p,
          match: `${game.homeName} vs ${game.awayName}`,
          prob
        });
      }
    }

    const best = candidates.sort((a, b) => b.prob - a.prob)[0];

    return res.status(200).json({
      ok: true,
      aiScorerTip: best ? {
        player: best.name,
        team: best.team,
        match: best.match,
        probability: Math.round(best.prob * 100),
        headshot: best.headshot,
        goals: best.goals,
        shots: best.shots,
        powerPlayGoals: best.powerPlayGoals
      } : null
    });

  } catch (err) {
    console.error("❌ AI Scorer Error:", err.message);
    return res.status(200).json({ ok: false, aiScorerTip: null });
  }
}
