// /api/odds.js
import axios from "axios";

export default async function handler(req, res) {
  try {
    console.log("🔹 [/api/odds] Načítavam kurzy...");

    const oddsUrl = "https://api-web.nhle.com/v1/partner-game/SK/now";
    const resp = await axios.get(oddsUrl, { timeout: 10000 });
    const data = resp.data || {};

    if (!data.games || !Array.isArray(data.games)) {
      return res.status(200).json({
        ok: false,
        error: "No games in response",
        oddsMap: {}
      });
    }

    // Vytvor mapu kurzov podľa gameId
    const oddsMap = {};
    data.games.forEach(game => {
      const gameId = game.gameId;
      const homeOdds = game.homeTeam?.odds || [];
      const awayOdds = game.awayTeam?.odds || [];
      
      // Nájdi 3-way kurz (MONEY_LINE_3_WAY s prázdnym alebo bez qualifier, ale nie "Draw")
      const home3Way = homeOdds.find(o => {
        return o.description === "MONEY_LINE_3_WAY" && 
               o.qualifier !== "Draw" && 
               (o.qualifier === "" || !o.qualifier);
      });
      const away3Way = awayOdds.find(o => {
        return o.description === "MONEY_LINE_3_WAY" && 
               o.qualifier !== "Draw" && 
               (o.qualifier === "" || !o.qualifier);
      });
      
      if (home3Way || away3Way) {
        oddsMap[gameId] = {
          home: home3Way ? Number(home3Way.value) : null,
          away: away3Way ? Number(away3Way.value) : null
        };
      }
    });

    console.log(`✅ Načítaných kurzov pre ${Object.keys(oddsMap).length} zápasov`);

    return res.status(200).json({
      ok: true,
      oddsMap
    });

  } catch (err) {
    console.error("❌ [/api/odds] Chyba:", err.message);
    return res.status(200).json({
      ok: false,
      error: err.message,
      oddsMap: {}
    });
  }
}
