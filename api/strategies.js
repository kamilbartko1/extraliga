// /api/strategies.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Absolútne cesty pre Vercel (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handler(req, res) {
  try {
    // 1️⃣ Načítaj lokálnu databázu hráčov
    const dbPath = path.join(__dirname, "../data/nhl_players.json");
    const raw = await fs.readFile(dbPath, "utf-8");
    const players = JSON.parse(raw);

    // 2️⃣ Vyber len základné údaje (Meno, Klub, Krajina)
    const table = players.map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      team: p.team,
      country: p.country,
    }));

    // 3️⃣ Pošli JSON odpoveď
    res.status(200).json({
      ok: true,
      count: table.length,
      players: table,
    });
  } catch (err) {
    console.error("❌ Chyba pri čítaní nhl_players.json:", err);
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
