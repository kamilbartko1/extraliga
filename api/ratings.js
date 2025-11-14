// /api/ratings.js
// Poskytuje ultra-rýchly prístup k posledným spočítaným ratingom
// Importujeme server instance, kde je uložený LAST_RATINGS

import app from "../server.js"; 

export default function handler(req, res) {
  try {
    // LAST_RATINGS je definované v /api/matches.js a exportované cez server.js
    const { LAST_RATINGS } = app.locals;

    if (
      !LAST_RATINGS ||
      !Object.keys(LAST_RATINGS.teamRatings || {}).length ||
      !Object.keys(LAST_RATINGS.playerRatings || {}).length
    ) {
      return res.status(503).json({
        ok: false,
        message: "Ratingy ešte nie sú pripravené. Najprv spusti /api/matches.",
        teamRatings: {},
        playerRatings: {},
      });
    }

    return res.status(200).json({
      ok: true,
      teamRatings: LAST_RATINGS.teamRatings,
      playerRatings: LAST_RATINGS.playerRatings,
    });

  } catch (err) {
    console.error("❌ /api/ratings ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
      teamRatings: {},
      playerRatings: {},
    });
  }
}
