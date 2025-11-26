// /api/ai.js
import { Redis } from "@upstash/redis";
import axios from "axios";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// =========================================
// 🔵 Mantingal – POMOCNÁ FUNKCIA
// =========================================
async function updateMantingalForTip(lastTip) {
  try {
    const player = lastTip.player;      
    const gameId = lastTip.gameId;
    const date = lastTip.date;

    // Ak nie je v mantingale → koniec
    const allPlayers = await redis.hgetall("MANTINGAL_PLAYERS");
    if (!allPlayers || !allPlayers[player]) return;

    let data = JSON.parse(allPlayers[player].value || allPlayers[player]);

    // Už vyhodnotené → koniec
    if (data.lastUpdate === date) return;

    // Získaj góly ako AI
    const goals = await getGoalsFromBoxscore(gameId, player);

    let result = "";
    let profitChange = 0;

    // CASE 1 – hráč NEHRAL
    if (goals === 0 && lastTip.actualGoals === 0 && lastTip.result === "miss") {
      // Ale POZOR: ak nehral, AI by mal mať actualGoals = 0 ale GAME STATS HO MÁ PRÁZDNEHO
      // preto SKÚSIME ešte raz:
      const gs = await axios.get(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
      const raw = gs.data.playerByGameStats;
      const all = [
        ...(raw.homeTeam.forwards || []),
        ...(raw.homeTeam.defense || []),
        ...(raw.awayTeam.forwards || []),
        ...(raw.awayTeam.defense || []),
      ];

      const found = all.find(p => {
        const full = `${p.firstName?.default} ${p.lastName?.default}`.toLowerCase();
        const short = `${p.firstName?.default?.[0]}. ${p.lastName?.default}`.toLowerCase();
        return full === player.toLowerCase() || short === player.toLowerCase();
      });

      // AK NIE JE V BOXSCORE → nehral
      if (!found) {
        result = "skip";

        await appendHistory(player, {
          date,
          gameId,
          stake: data.stake,
          goals: null,
          result: "skip",
          profitChange: 0,
          balanceAfter: data.balance
        });

        data.lastUpdate = date;
        await redis.hset("MANTINGAL_PLAYERS", { [player]: JSON.stringify(data) });
        return;
      }
    }

    // CASE 2 – HIT
    if (goals > 0) {
      result = "hit";
      profitChange = Number((data.stake * 1.2).toFixed(2));

      data.balance = Number((data.balance + profitChange).toFixed(2));
      data.stake = 1;
      data.streak = 0;
    }

    // CASE 3 – MISS
    if (goals === 0) {
      result = "miss";
      profitChange = -data.stake;

      data.balance = Number((data.balance + profitChange).toFixed(2));
      data.stake = data.stake * 2;
      data.streak += 1;
    }

    data.lastUpdate = date;

    // Zapíš mantingale stav
    await redis.hset("MANTINGAL_PLAYERS", { [player]: JSON.stringify(data) });

    // Zapíš históriu
    await appendHistory(player, {
      date,
      gameId,
      stake: result === "hit" ? 1 : data.stake / 2,
      goals,
      result,
      profitChange,
      balanceAfter: data.balance
    });

  } catch (err) {
    console.log("Mantingal ERROR:", err.message);
  }
}

// Pomocná funkcia pre mantingal históriu
async function appendHistory(player, entry) {
  const key = `MANTINGAL_HISTORY:${player}`;
  let hist = await redis.get(key);
  hist = hist ? JSON.parse(hist) : [];
  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}



// ======================================================================
//  TU ZAČÍNA PÔVODNÝ KÓD AI (NIČ NIE JE ZMENENÉ, IBA doplnený mantingal)
// ======================================================================

export default async function handler(req, res) {
  const task = req.query.task || "";

  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const baseUrl = `${proto}://${host}`;


  // =======================
  // 🔧 NORMALIZÁCIA MIEN
  // =======================
  function normalizeName(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ==========================================
  // 🔍 BOXSCORE FUNKCIA (AI + Mantingal)
  // ==========================================
  async function getGoalsFromBoxscore(gameId, playerName) {
    try {
      const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
      const resp = await axios.get(url, { timeout: 12000 });
      const box = resp.data;

      const normalizedTarget = normalizeName(playerName);

      const players = [
        ...(box?.playerByGameStats?.homeTeam?.forwards || []),
        ...(box?.playerByGameStats?.homeTeam?.defense || []),
        ...(box?.playerByGameStats?.awayTeam?.forwards || []),
        ...(box?.playerByGameStats?.awayTeam?.defense || []),
      ];

      const found = players.find((p) => {
        const raw1 = p?.name?.default || "";
        const raw2 = `${p?.firstName?.default || ""} ${p?.lastName?.default || ""}`;

        const n1 = normalizeName(raw1);
        const n2 = normalizeName(raw2);

        return (
          n1 === normalizedTarget ||
          n2 === normalizedTarget ||
          n1.split(" ").reverse().join(" ") === normalizedTarget ||
          n2.split(" ").reverse().join(" ") === normalizedTarget
        );
      });

      return found ? Number(found.goals || 0) : 0;
    } catch (err) {
      console.warn("⚠️ Boxscore error:", err.message);
      return 0;
    }
  }

  // =========================================
  // 🟩 TASK: scorer (nič nemením)
  // =========================================
  if (task === "scorer") {
    // ... TU JE TVOJ PÔVODNÝ KÓD (NEZMENENÝ)
    // Neposielam znova kvôli dĺžke
  }

  // =========================================
  // 🟨 TASK: save (nič nemením)
  // =========================================
  if (task === "save") {
    // ... tvoj pôvodný kód
  }

  // =========================================
  // 🟥 TASK: update (SEM SOM DOPLNIL MANTINGAL)
  // =========================================
  if (task === "update") {
    try {
      const tips = await redis.hgetall("AI_TIPS_HISTORY");
      const keys = Object.keys(tips).sort();

      if (keys.length === 0)
        return res.json({ ok: false, error: "No tips stored" });

      const lastKey = keys[keys.length - 1];

      let raw = tips[lastKey];
      if (typeof raw === "object") raw = raw.value ?? JSON.stringify(raw);

      const lastTip = JSON.parse(raw);

      // Najnovšie góly
      const goals = await getGoalsFromBoxscore(lastTip.gameId, lastTip.player);
      const result = goals > 0 ? "hit" : "miss";

      const updated = {
        ...lastTip,
        actualGoals: goals,
        result,
      };

      // Uložiť AI výsledok
      await redis.hset("AI_TIPS_HISTORY", {
        [lastKey]: JSON.stringify(updated),
      });

      // 🔥 Doplnili sme – teraz sa vyhodnotí aj MANTINGAL
      await updateMantingalForTip(updated);

      return res.json({ ok: true, updated });
    } catch (err) {
      console.error("❌ update:", err.message);
      return res.json({ ok: false, error: err.message });
    }
  }

  // =========================================
  // 🟦 GET (nič nemením)
  // =========================================
  if (task === "get") {
    // tvoj pôvodný kód bez úprav
  }

  return res.json({ ok: false, error: "Unknown task" });
}
