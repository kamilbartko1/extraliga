// /api/mantingal.js
// Jednoduché: výpočet + trvalá história v Upstash Redis (bez RAM, bez súborov)

const USE_UPSTASH = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_BETS_KEY = "mantingal_bets_v1"; // globálny list histórie (najnovšie prvé)
const BETS_CAP = 5000; // drž posledných 5000 záznamov

// --- Upstash REST helpers (bez knižníc) ---
async function redisLPushJSON(key, valueObj) {
  const url = `${REDIS_URL}/lpush/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(valueObj))}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!resp.ok) throw new Error("Upstash LPUSH error");
}

async function redisLTrim(key, start, stop) {
  const url = `${REDIS_URL}/ltrim/${encodeURIComponent(key)}/${start}/${stop}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!resp.ok) throw new Error("Upstash LTRIM error");
}

async function redisLRangeJSON(key, start, stop) {
  const url = `${REDIS_URL}/lrange/${encodeURIComponent(key)}/${start}/${stop}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } });
  if (!resp.ok) throw new Error("Upstash LRANGE error");
  const data = await resp.json(); // Upstash vracia { result: [ "json", "json", ... ] }
  const arr = data?.result || [];
  return arr.map(s => {
    try { return JSON.parse(s); } catch { return null; }
  }).filter(Boolean);
}

// --- Tvoja existujúca logika (upravená len minimálne) ---
export default async function handler(req, res) {
  try {
    // 1) endpoint na čítanie histórie: /api/mantingal?action=history&limit=50
    if (req.method === "GET" && (req.query.action === "history")) {
      if (!USE_UPSTASH) {
        return res.status(500).json({ ok: false, error: "Upstash nie je nastavený (chýba URL/TOKEN)." });
      }
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || "50", 10)));
      // LRANGE 0..limit-1 (najnovšie prvé, keďže LPUSH)
      const bets = await redisLRangeJSON(KV_BETS_KEY, 0, limit - 1);
      return res.status(200).json({ ok: true, bets });
    }

    // 2) hlavný výpočet ako doteraz (len na konci uložíme do Redis)
    const FIXED_ODDS = 2.2;  // kurz pre výhru
    const BASE_STAKE = 1;    // základná stávka v eurách

    // ❗ Kontrola Upstash ešte pred výpočtom (nech padne hneď, ak nie je nastavený)
    if (!USE_UPSTASH) {
      return res.status(500).json({
        ok: false,
        error: "Upstash nie je nastavený. Pridaj UPSTASH_REDIS_REST_URL a UPSTASH_REDIS_REST_TOKEN do Vercel env."
      });
    }

    console.log("🏁 Spúšťam Mantingal výpočet...");

    // 1️⃣ Načítaj Top10 hráčov
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

    // 2️⃣ Včerajší dátum (UTC)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    console.log("📅 Kontrolujem dátum:", dateStr);

    // 3️⃣ Včerajšie zápasy
    const scoreResp = await fetch(`https://api-web.nhle.com/v1/score/${dateStr}`);
    if (!scoreResp.ok) throw new Error("Nepodarilo sa načítať včerajšie zápasy");
    const scoreData = await scoreResp.json();
    const games = Array.isArray(scoreData.games) ? scoreData.games : [];

    // 4️⃣ Hráči a strelci z boxscore
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

    // 5️⃣ Mantingal výpočet
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
        // POZOR: v pôvodnom kóde si mal logiku totalProfit -= player.stake *po* zdvojnásobení,
        // čo nie je správne (odráža ďalší stake, nie aktuálnu stratu).
        // Korektné je odpočítať práve prehraný stake:
        totalProfit -= player.stake;
        player.stake *= 2;
      }
    }

    // 6️⃣ Uloženie do Upstash Redis (história)
    // Každého hráča zapíšeme ako 1 "bet" (najnovšie idú na začiatok listu).
    const ts = new Date().toISOString();

    for (const player of top10) {
      const bet = {
        day: dateStr,
        name: player.name,
        stake: player.stake,          // POZOR: toto je už "next stake" po výpočte; ak chceš uložiť "pôvodný stake", ulož si ho do pomocnej premennej pred výpočtom
        result: player.lastResult,
        profitAfter: Number(player.profit.toFixed(4)),
        ts
      };
      await redisLPushJSON(KV_BETS_KEY, bet);
    }

    // udrž posledných 5000 záznamov
    await redisLTrim(KV_BETS_KEY, 0, BETS_CAP - 1);

    // 7️⃣ Odpoveď
    return res.status(200).json({
      ok: true,
      dateChecked: dateStr,
      totalGames: games.length,
      scorers: scorers.size,
      players: top10,
      totalProfit: Number(totalProfit.toFixed(2)),
      savedTo: KV_BETS_KEY
    });

  } catch (err) {
    console.error("❌ Mantingal chyba:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
