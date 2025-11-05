// /api/team-recent.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { team } = req.query;
    if (!team) return res.status(400).json({ ok: false, error: "Missing team code" });

    const url = `https://api-web.nhle.com/v1/club-schedule-season/${team}/20252026`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`NHL API error ${resp.status}`);

    const data = await resp.json();
    const games = Array.isArray(data.games) ? data.games : [];

    // Najnovších 10 zápasov (len FINAL)
    const recent = games
      .filter(g => g.gameState === "FINAL")
      .slice(-10)
      .reverse()
      .map(g => {
        const isHome = g.homeTeam.abbrev === team;
        const opponent = isHome ? g.awayTeam : g.homeTeam;
        const win = (isHome && g.homeTeam.score > g.awayTeam.score) ||
                    (!isHome && g.awayTeam.score > g.homeTeam.score);

        return {
          id: g.id,
          date: g.gameDate,
          home: g.homeTeam.abbrev,
          away: g.awayTeam.abbrev,
          homeScore: g.homeTeam.score,
          awayScore: g.awayTeam.score,
          opponent: opponent.abbrev,
          opponentLogo: opponent.logo,
          result: win ? "W" : "L",
          link: `https://www.nhl.com${g.gameCenterLink}`
        };
      });

    res.json({ ok: true, team, games: recent });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
