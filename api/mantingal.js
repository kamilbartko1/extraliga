// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  try {
    const FIXED_ODDS = 2.2;
    const BASE_STAKE = 1;

    console.log("🏁 Spúšťam Mantingal výpočet...");

    // 🟢 1️⃣ Načítaj Top10 hráčov
    const matchesResp = await fetch("https://nhlpro.sk/api/matches", { cache: "no-store" });
    if (!matchesResp.ok) throw new Error("Nepodarilo sa načítať zápasy z /api/matches");
    const matchesData = await matchesResp.json();
    const playerRatings = matchesData.playerRatings || {};

    const top10 = Object.entries(playerRatings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => ({
        name,
        stake: BASE_STAKE,
        profit: 0,
        streak: 0,
        lastResult: "-",
      }));

    // 🟢 2️⃣ Zisti včerajší dátum
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    // 🟢 3️⃣ Načítaj včerajšie zápasy
    const scoreResp = await fetch(`https://api-web.nhle.com/v1/score/${dateStr}`);
    if (!scoreResp.ok) throw new Error("Nepodarilo sa načítať včerajšie zápasy");
    const scoreData = await scoreResp.json();
    const games = Array.isArray(scoreData.games) ? scoreData.games : [];

    // 🟢 4️⃣ Hráči a strelci
    const scorers = new Set();
    const playedPlayers = new Set();

    for (const g of games) {
      if (!g.id) continue;
      try {
        const boxResp = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
        if (!boxResp.ok) continue;
        const box = await boxResp.json();

        const players = [
          ...(box?.playerByGameStats?.homeTeam?.forwards || []),
          ...(box?.playerByGameStats?.homeTeam?.defense || []),
          ...(box?.playerByGameStats?.awayTeam?.forwards || []),
          ...(box?.playerByGameStats?.awayTeam?.defense || []),
        ];

        for (const p of players) {
          const nm = String(p.name?.default || "").toLowerCase().trim();
          if (!nm) continue;
          playedPlayers.add(nm);
          if (p.goals && p.goals > 0) scorers.add(nm);
        }
      } catch (err) {
        console.warn(`⚠️ Boxscore ${g.id}: ${err.message}`);
      }
    }

    // 🟢 5️⃣ Mantingal výpočet
    let totalProfit = 0;

    for (const player of top10) {
      const clean = player.name.toLowerCase();

      const played = Array.from(playedPlayers).some(
        (p) => p.includes(clean) || clean.includes(p)
      );

      const scored = Array.from(scorers).some(
        (s) => s.includes(clean) || clean.includes(s)
      );

      if (!played) {
        player.lastResult = "skip";
        player.stake = BASE_STAKE;
        continue;
      }

      if (scored) {
        const win = player.stake * (FIXED_ODDS - 1);
        player.profit += win;
        player.lastResult = "win";
        player.stake = BASE_STAKE;
        totalProfit += win;
      } else {
        player.profit -= player.stake;
        player.lastResult = "loss";
        player.stake *= 2;
        totalProfit -= player.stake;
      }
    }

    // 🟢 6️⃣ Uloženie do súboru data/mantingal.json
    const filePath = path.join(process.cwd(), "data", "mantingal.json");

    // načítaj existujúci obsah (ak existuje)
    let current = { history: [] };
    try {
      const content = await fs.readFile(filePath, "utf-8");
      current = JSON.parse(content);
    } catch {
      console.log("🆕 Vytváram nový súbor mantingal.json");
    }

    // pridaj nové záznamy
    for (const player of top10) {
      current.history.push({
        day: dateStr,
        name: player.name,
        stake: player.stake,
        result: player.lastResult,
        profitAfter: player.profit,
      });
    }

    // zachovaj len posledných 500 záznamov
    if (current.history.length > 500) {
      current.history = current.history.slice(-500);
    }

    // zapíš späť
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(current, null, 2), "utf-8");

    // 🟢 7️⃣ Výsledok
    return res.status(200).json({
      ok: true,
      dateChecked: dateStr,
      totalGames: games.length,
      scorers: scorers.size,
      players: top10,
      totalProfit: totalProfit.toFixed(2),
      saved: true,
      file: "/data/mantingal.json",
    });
  } catch (err) {
    console.error("❌ Mantingal chyba:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
