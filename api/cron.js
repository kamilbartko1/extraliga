import axios from "axios";
import { Redis } from "@upstash/redis";

// 🌐 Globálna BASE premenná (bude nastavená v handleri)
let base = "";

// Inicializácia Upstash
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// =======================================
// 🔧 Pomocné funkcie pre Mantingal
// =======================================

const M_PLAYERS = "MANTINGAL_PLAYERS";

// bezpečné JSON
// bezpečné JSON
function safeParse(raw) {
  try {
    if (!raw) return {};

    // string -> JSON
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }

    // objekt z Upstasha
    if (typeof raw === "object" && raw !== null) {
      // prípad { value: "..." }
      if (raw.value && typeof raw.value === "string") {
        try {
          return JSON.parse(raw.value);
        } catch {
          return {};
        }
      }
      // už je to normálny objekt (stake, streak, balance, teamAbbrev...)
      return raw;
    }

    return {};
  } catch {
    return {};
  }
}

// pomocny helper
async function appendVipHistory(prefix, playerName, entry) {
  const key = `${prefix}:${playerName}`;
  let hist = [];

  const raw = await redis.get(key);

  if (raw) {
    try {
      hist = typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
      if (!Array.isArray(hist)) hist = [];
    } catch {
      hist = [];
    }
  }

  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}

// garantovaná štruktúra hráča (aj teamAbbrev)
function normalizePlayer(obj) {
  return {
    stake: Number(obj.stake ?? 1),
    streak: Number(obj.streak ?? 0),
    balance: Number(obj.balance ?? 0),
    odds: Number(obj.odds ?? 2.2),   // 🔥 POVINNÉ
    started: obj.started || null,
    lastUpdate: obj.lastUpdate || null,
    teamAbbrev: obj.teamAbbrev || obj.team || null,
  };
}

// normalizácia mena (ako pri AI)
function normalizeName(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// uloženie do histórie
async function appendHistory(player, entry) {
  const key = `MANTINGAL_HISTORY:${player}`;
  let hist = [];

  const raw = await redis.get(key);
  if (raw) {
    try {
      hist = typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
      if (!Array.isArray(hist)) hist = [];
    } catch {
      hist = [];
    }
  }

  hist.push(entry);
  await redis.set(key, JSON.stringify(hist));
}

// =======================================
// 🔧 Martingale engine (GLOBAL + VIP)
// =======================================
async function updateMantingaleForKey(playersKey, historyPrefix) {
  console.log(`🔥 Mantingal: vyhodnocujem ${playersKey}`);

  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // ===============================
  // SCORE API
  // ===============================
  let games;
  try {
    const r = await axios.get(
      `https://api-web.nhle.com/v1/score/${y}`,
      { timeout: 12000 }
    );
    games = r.data?.games || [];
  } catch (err) {
    console.log("❌ SCORE API ERROR:", err.message);
    return;
  }

  if (!games.length) {
    console.log("⚠️ No games yesterday");
    return;
  }

  // ===============================
  // PLAYERS
  // ===============================
  const players = await redis.hgetall(playersKey);
  if (!players || Object.keys(players).length === 0) return;

  const teamsPlayed = new Set();
  for (const g of games) {
    teamsPlayed.add(g.homeTeam?.abbrev);
    teamsPlayed.add(g.awayTeam?.abbrev);
  }

  const isGlobal = historyPrefix === "MANTINGAL_HISTORY";

  // ===============================
  // NORMALIZE + FIND
  // ===============================
  function normalizeName(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findPlayerInBox(box, target) {
    const list = [
      ...(box?.playerByGameStats?.homeTeam?.forwards || []),
      ...(box?.playerByGameStats?.homeTeam?.defense || []),
      ...(box?.playerByGameStats?.awayTeam?.forwards || []),
      ...(box?.playerByGameStats?.awayTeam?.defense || []),
    ];

    const t = normalizeName(target);

    return list.find((p) => {
      const r1 = normalizeName(p?.name?.default || "");
      const r2 = normalizeName(
        `${p?.firstName?.default || ""} ${p?.lastName?.default || ""}`
      );

      return (
        r1 === t ||
        r2 === t ||
        r1.split(" ").reverse().join(" ") === t ||
        r2.split(" ").reverse().join(" ") === t
      );
    });
  }

  // ===============================
  // LOOP PLAYERS
  // ===============================
  for (const [playerName, raw] of Object.entries(players)) {
    let state = normalizePlayer(safeParse(raw));
    const team = state.teamAbbrev;

    // ---------- SKIP (team not played)
    if (!team || !teamsPlayed.has(team)) {
      const entry = {
        date: y,
        gameId: null,
        goals: null,
        result: "skip",
        profitChange: 0,
        balanceAfter: state.balance,
      };

      if (isGlobal) {
        await appendHistory(playerName, entry);
      } else {
        await appendVipHistory(historyPrefix, playerName, entry);
      }

      state.lastUpdate = y;
      await redis.hset(playersKey, {
        [playerName]: JSON.stringify(state),
      });
      continue;
    }

    // ---------- FIND GAME
    const game = games.find(
      (g) => g.homeTeam?.abbrev === team || g.awayTeam?.abbrev === team
    );
    if (!game) continue;

    // ---------- BOXSCORE
    let box;
    try {
      const r = await axios.get(
        `https://api-web.nhle.com/v1/gamecenter/${game.id}/boxscore`,
        { timeout: 12000 }
      );
      box = r.data;
    } catch {
      continue;
    }

    const found = findPlayerInBox(box, playerName);

    // ---------- SKIP (not on roster)
    if (!found) {
      const entry = {
        date: y,
        gameId: game.id,
        goals: null,
        result: "skip",
        profitChange: 0,
        balanceAfter: state.balance,
      };

      if (isGlobal) {
        await appendHistory(playerName, entry);
      } else {
        await appendVipHistory(historyPrefix, playerName, entry);
      }

      state.lastUpdate = y;
      await redis.hset(playersKey, {
        [playerName]: JSON.stringify(state),
      });
      continue;
    }

    const currentStake = state.stake; // 🔥 Capture original stake before changes

    const goals = Number(found.goals || 0);


    // ---------- HIT
    if (goals > 0) {
      // ✅ NET PROFIT (nie return)
      const profit = Number(
        (currentStake * (state.odds - 1)).toFixed(2)
      );

      state.balance = Number(
        (state.balance + profit).toFixed(2)
      );

      const entry = {
        date: y,
        gameId: game.id,
        goals,
        result: "hit",
        profitChange: profit,       // ✅ čistý zisk
        balanceAfter: state.balance,
        stake: currentStake,         // ✅ USE ORIGINAL STAKE
        odds: state.odds,            // ✅ uložíme odds pre správny výpočet ROI
      };

      if (isGlobal) {
        await appendHistory(playerName, entry);
      } else {
        await appendVipHistory(historyPrefix, playerName, entry);
      }

      // reset martingale
      state.stake = 1;
      state.streak = 0;
      state.lastUpdate = y;

      await redis.hset(playersKey, {
        [playerName]: JSON.stringify(state),
      });

      continue;
    }

    // ---------- MISS
    const loss = -currentStake; // ✅ Use original stake
    state.balance = Number((state.balance + loss).toFixed(2));
    state.stake *= 2; // Doubles for NEXT round
    state.streak += 1;

    const entry = {
      date: y,
      gameId: game.id,
      goals: 0,
      result: "miss",
      profitChange: loss,
      balanceAfter: state.balance,
      stake: currentStake,         // ✅ SAVE ORIGINAL STAKE (e.g. 1), not doubled (2)
      odds: state.odds,
    };

    if (isGlobal) {
      await appendHistory(playerName, entry);
    } else {
      await appendVipHistory(historyPrefix, playerName, entry);
    }

    state.lastUpdate = y;
    await redis.hset(playersKey, {
      [playerName]: JSON.stringify(state),
    });
  }
}

// ===============================================
// 🔥 CRON – AI + MANTINGAL
// ===============================================
export default async function handler(req, res) {
  try {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;

    base = `${proto}://${host}`;

    let executed = null;

    // 1) UPDATE + MANTINGAL
    // (čas máš aktuálne nastavený na 10:20 UTC)
    if (utcHour === 7 && utcMinute < 50) {

      // 🔹 1️⃣ Najprv vyhodnotíme AI tip (nemeniť)
      await axios.get(`${base}/api/ai?task=update`);

      // 🔹 2️⃣ GLOBAL MANTINGAL – PRIAMO cez engine
      await updateMantingaleForKey(
        "MANTINGAL_PLAYERS",
        "MANTINGAL_HISTORY"
      );

      executed = "update + mantingale";

      // 🔹 3️⃣ VIP MANTINGAL – BEZPEČNE PRE KAŽDÉHO USERA
      try {
        const vipUsers = await redis.smembers("VIP_USERS");

        if (Array.isArray(vipUsers) && vipUsers.length > 0) {
          for (const userId of vipUsers) {
            await updateMantingaleForKey(
              `VIP_MTG:${userId}`,
              `VIP_MTG_HISTORY:${userId}`
            );
          }
          console.log("👑 VIP Mantingal OK – users:", vipUsers.length);
        } else {
          console.log("👑 VIP Mantingal – no users");
        }
      } catch (e) {
        console.error("❌ VIP Mantingal error:", e.message);
      }

      // 🔹 4️⃣ TIPS GAME – vyhodnotenie včerajších 1X2 tipov (Europe/Bratislava)
      try {
        await axios.post(`${base}/api/vip?task=evaluate_tips_yesterday`);
        console.log("📋 Tips game – yesterday evaluated");
      } catch (e) {
        console.error("❌ Tips evaluate error:", e.message);
      }
    }

    // 2) SCORER
    else if (utcHour === 11 && utcMinute < 5) {
      await axios.get(`${base}/api/ai?task=scorer`);
      executed = "scorer";
    }

    // 3) SAVE
    else if (utcHour === 11 && utcMinute < 22) {
      await axios.get(`${base}/api/ai?task=save`);
      executed = "save";
    }

    return res.json({
      ok: true,
      time: now.toISOString(),
      executed: executed || "nothing",
    });
  } catch (err) {
    console.error("❌ CRON ERROR:", err);
    return res.json({ ok: false, error: err.message });
  }
}
