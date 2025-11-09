// /api/home.js
import axios from "axios";

const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// SERVERLESS HANDLER – kompatibilný s Vercelom
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/home] Volanie endpointu...");

    const date = new Date().toISOString().slice(0, 10);
    const scoreUrl = `https://api-web.nhle.com/v1/score/${date}`;

    // === 1️⃣ Získanie zápasov z NHL API ===
    const resp = await axios.get(scoreUrl, { timeout: 10000 });
    const data = resp.data || {};
    const gamesRaw = Array.isArray(data.games) ? data.games : [];

    const games = gamesRaw.map((g) => ({
      id: g.id,
      date: g.gameDate || date,
      homeName: g.homeTeam?.name?.default || "Domáci",
      awayName: g.awayTeam?.name?.default || "Hostia",
      homeLogo: g.homeTeam?.logo || logo(g.homeTeam?.abbrev),
      awayLogo: g.awayTeam?.logo || logo(g.awayTeam?.abbrev),
      homeCode: g.homeTeam?.abbrev || "",
      awayCode: g.awayTeam?.abbrev || "",
      startTime: g.startTimeUTC
        ? new Date(g.startTimeUTC).toLocaleTimeString("sk-SK", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "??:??",
      venue: g.venue?.default || "",
      status: g.gameState || "FUT",
    }));

    console.log(`✅ Načítaných zápasov: ${games.length}`);

    // === 2️⃣ AI TIP DŇA – výpočet podľa ratingov tímov ===
    let aiTip = {
      home: "N/A",
      away: "N/A",
      prediction: "Dáta sa načítavajú...",
      confidence: 0,
      odds: "-",
    };

    try {
      // Načítaj ratingy z tvojho backendu
      const baseUrl =
        process.env.VERCEL_URL ||
        "https://nhlpro.sk"; // uprav ak máš inú doménu
      const ratingsResp = await axios.get(`${baseUrl}/api/matches`, {
        timeout: 10000,
      });

      const teamRatings = ratingsResp.data?.teamRatings || {};
      if (!Object.keys(teamRatings).length)
        throw new Error("Žiadne ratingy tímov");

      // Pre každý zápas spočítaj skóre
      const scored = games.map((g) => {
        const homeR = teamRatings[g.homeName] || 1500;
        const awayR = teamRatings[g.awayName] || 1500;
        const diff = homeR - awayR + 5; // malý bonus za domáce prostredie
        return { ...g, score: diff };
      });

      // Najväčší ratingový rozdiel = AI tip dňa
      const best = scored.sort((a, b) => b.score - a.score)[0];
      if (best) {
        aiTip = {
          home: best.homeName,
          away: best.awayName,
          prediction: `Výhra ${best.homeName}`,
          confidence: Math.min(95, 60 + Math.abs(best.score) / 15),
          odds: (1.5 + Math.random() * 0.8).toFixed(2),
        };
      } else {
        aiTip.prediction = "Žiadne zápasy pre dnešný deň.";
      }
    } catch (err) {
      console.warn("⚠️ AI tip – výpočet zlyhal:", err.message);
    }

    // === 3️⃣ Mini štatistiky (dočasne statické) ===
    const stats = {
      topScorer: "Connor McDavid – 12 gólov",
      bestShooter: "Auston Matthews – 22 % streľba",
      mostPenalties: "Tom Wilson – 29 trestných minút",
    };

    // === 4️⃣ Odpoveď pre frontend ===
    return res.status(200).json({
      ok: true,
      date,
      count: games.length,
      matchesToday: games,
      aiTip,
      stats,
    });
  } catch (err) {
    console.error("❌ [/api/home] Chyba:", err.message);
    return res.status(200).json({
      ok: false,
      date: new Date().toISOString().slice(0, 10),
      error: err.message,
      matchesToday: [],
      aiTip: {
        home: "N/A",
        away: "N/A",
        prediction: "Nepodarilo sa načítať dáta.",
        confidence: 0,
        odds: "-",
      },
      stats: {
        topScorer: "-",
        bestShooter: "-",
        mostPenalties: "-",
      },
    });
  }
}
