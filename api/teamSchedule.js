// /api/teamSchedule.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const { team } = req.query;
    if (!team) {
      return res.status(400).json({ ok: false, error: "Missing team code (e.g. TOR)" });
    }

    const url = `https://api-web.nhle.com/v1/club-schedule-season/${team}/20252026`;
    const resp = await fetch(url);

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: `Upstream NHL API error ${resp.status}` });
    }

    const data = await resp.json();
    const games = (data.games || [])
      .filter(g => g.gameState === "FINAL")
      .slice(-10)
      .reverse()
      .map(g => ({
        date: g.gameDate,
        home: g.homeTeam?.abbrev,
        away: g.awayTeam?.abbrev,
        homeScore: g.homeTeam?.score,
        awayScore: g.awayTeam?.score,
        won:
          (g.homeTeam?.abbrev === team && g.homeTeam?.score > g.awayTeam?.score) ||
          (g.awayTeam?.abbrev === team && g.awayTeam?.score > g.homeTeam?.score),
      }));

    res.json({ ok: true, team, games });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
