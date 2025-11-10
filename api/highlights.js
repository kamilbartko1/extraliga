// /api/highlights.js
import axios from "axios";

// Mapovanie tímov (home_team → trojpísmenkový kód)
const TEAM_CODES = {
  Ducks: "ANA",
  Coyotes: "ARI",
  Bruins: "BOS",
  Sabres: "BUF",
  Flames: "CGY",
  Hurricanes: "CAR",
  Blackhawks: "CHI",
  Avalanche: "COL",
  BlueJackets: "CBJ",
  Stars: "DAL",
  RedWings: "DET",
  Oilers: "EDM",
  Panthers: "FLA",
  Kings: "LAK",
  Wild: "MIN",
  Canadiens: "MTL",
  Predators: "NSH",
  Devils: "NJD",
  Islanders: "NYI",
  Rangers: "NYR",
  Senators: "OTT",
  Flyers: "PHI",
  Penguins: "PIT",
  Sharks: "SJS",
  Kraken: "SEA",
  Blues: "STL",
  Lightning: "TBL",
  MapleLeafs: "TOR",
  Canucks: "VAN",
  GoldenKnights: "VGK",
  Capitals: "WSH",
  Jets: "WPG",
  Mammoth: "UTA",
};

export default async function handler(req, res) {
  try {
    const { team, id } = req.query;
    if (!team || !id) {
      return res.status(400).json({ ok: false, error: "Chýba parameter team alebo id" });
    }

    // Zistíme trojpísmenový kód
    const teamCode = TEAM_CODES[team.replace(/\s+/g, "")] || null;
    if (!teamCode) {
      return res.json({ ok: false, error: `Neznámy tím: ${team}` });
    }

    // Stiahneme zápasy daného klubu
    const url = `https://api-web.nhle.com/v1/club-schedule-season/${teamCode}/20252026`;
    const resp = await axios.get(url, { timeout: 15000 });

    const games = resp.data?.games || [];
    const game = games.find((g) => String(g.id) === String(id));

    if (!game) {
      return res.json({ ok: false, error: `Zápas ${id} sa nenašiel v rozvrhu ${teamCode}` });
    }

    const recap =
      game.threeMinRecap || game.condensedGame || game.gameCenterLink || null;

    if (!recap) {
      return res.json({ ok: false, error: "Žiadny zostrih sa nenašiel" });
    }

    return res.json({
      ok: true,
      team: teamCode,
      gameId: id,
      highlight: `https://www.nhl.com${recap}`,
    });
  } catch (err) {
    console.error("❌ Chyba highlights.js:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
