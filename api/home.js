// /api/home.js
import axios from "axios";

// Pomocná funkcia na logo tímu
const logo = (code) =>
  code ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg` : "";

// ========================================================
// SERVERLESS HANDLER – kompatibilný s Vercelom
// ========================================================
export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/home] Volanie endpointu...");

    // 👉 ak budeš chcieť testovať iný dátum:
    // const date = "2025-11-09";
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

    // === 2️⃣ AI TIP DŇA (partner-game API) ===
    let aiTip = {
      home: "N/A",
      away: "N/A",
      prediction: "Dáta sa načítavajú...",
      confidence: 0,
      odds: "-",
    };

    try {
      const predResp = await axios.get(
        "https://api-web.nhle.com/v1/partner-game/CZ/now",
        { timeout: 8000 }
      );
      const predGames = Array.isArray(predResp.data?.games)
        ? predResp.data.games
        : [];

      if (predGames.length > 0) {
        const g = predGames[0];
        aiTip = {
          home: g.homeTeamName?.default || "Domáci",
          away: g.awayTeamName?.default || "Hostia",
          prediction: "Výhra domáceho tímu",
          confidence: 75 + Math.floor(Math.random() * 10),
          odds: (1.6 + Math.random() * 0.8).toFixed(2),
        };
      }
    } catch (err) {
      console.warn("⚠️ Partner-game API nedostupné:", err.message);
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
