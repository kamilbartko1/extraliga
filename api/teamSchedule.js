// /api/teamSchedule.js
export default async function handler(req, res) {
  const { team } = req.query;
  if (!team) return res.status(400).json({ ok: false, error: "Missing team code" });

  try {
    const url = `https://api-web.nhle.com/v1/club-schedule-season/${team}/20252026`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const json = await response.json();

    const games = (json.games || [])
      .filter(g => g.gameState === "FINAL")
      .slice(-10)
      .map(g => {
        const home = g.homeTeam.abbrev;
        const away = g.awayTeam.abbrev;
        const result =
          (home === team && g.homeTeam.score > g.awayTeam.score) ||
          (away === team && g.awayTeam.score > g.homeTeam.score)
            ? "W"
            : "L";
        const opponent =
          home === team ? g.awayTeam.commonName.default : g.homeTeam.commonName.default;
        const opponentLogo =
          home === team ? g.awayTeam.logo : g.homeTeam.logo;

        return {
          date: g.gameDate,
          home,
          away,
          homeScore: g.homeTeam.score,
          awayScore: g.awayTeam.score,
          result,
          opponent,
          opponentLogo,
        };
      })
      .reverse();

    res.status(200).json({ ok: true, games });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
