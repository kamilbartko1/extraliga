// /api/vip.js
import { Redis } from "@upstash/redis";
import Stripe from "stripe";
import { requireAuth } from "./_auth.js";

// ===============================
// Inicializácie
// ===============================

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

// ===============================
// Redis kľúče
// ===============================

const VIP_USERS_KEY = "VIP_USERS";
const vipPlayersKey = (userId) => `VIP_MTG:${userId}`;
const vipHistoryKey = (userId, player) =>
  `VIP_MTG_HISTORY:${userId}:${player}`;

// ===============================
// Skratky timov
// ===============================
const TEAM_NAME_TO_ABBREV = {
  "Anaheim Ducks": "ANA",
  "Boston Bruins": "BOS",
  "Buffalo Sabres": "BUF",
  "Calgary Flames": "CGY",
  "Carolina Hurricanes": "CAR",
  "Chicago Blackhawks": "CHI",
  "Colorado Avalanche": "COL",
  "Columbus Blue Jackets": "CBJ",
  "Dallas Stars": "DAL",
  "Detroit Red Wings": "DET",
  "Edmonton Oilers": "EDM",
  "Florida Panthers": "FLA",
  "Los Angeles Kings": "LAK",
  "Minnesota Wild": "MIN",
  "Montreal Canadiens": "MTL",
  "Nashville Predators": "NSH",
  "New Jersey Devils": "NJD",
  "New York Islanders": "NYI",
  "New York Rangers": "NYR",
  "Ottawa Senators": "OTT",
  "Philadelphia Flyers": "PHI",
  "Pittsburgh Penguins": "PIT",
  "San Jose Sharks": "SJS",
  "Seattle Kraken": "SEA",
  "St. Louis Blues": "STL",
  "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR",
  "Utah Mammoth": "UTA",
  "Vancouver Canucks": "VAN",
  "Vegas Golden Knights": "VGK",
  "Washington Capitals": "WSH",
  "Winnipeg Jets": "WPG"
};

// ===============================
// Pomocné funkcie
// ===============================

function formatShortName(fullName) {
  const parts = fullName.trim().split(" ");
  if (parts.length < 2) return fullName;
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return `${first[0].toUpperCase()}. ${last}`;
}

function safeParse(raw) {
  try {
    if (!raw) return {};
    if (typeof raw === "string") return JSON.parse(raw);
    if (typeof raw === "object" && raw !== null) {
      if (raw.value && typeof raw.value === "string") {
        return JSON.parse(raw.value);
      }
      return raw;
    }
    return {};
  } catch {
    return {};
  }
}

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

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Stripe potrebuje RAW body
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ===============================
// Hlavný handler
// ===============================

export default async function handler(req, res) {
  try {
    const task = req.query.task || null;

    // =====================================================
    // STRIPE WEBHOOK – MUSÍ BYŤ PRVÝ (bez requireAuth)
    // =====================================================
    if (task === "stripe_webhook") {
      const sig = req.headers["stripe-signature"];
      const rawBody = await getRawBody(req);

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const userId = session.metadata?.userId;

        if (userId) {
          await redis.sadd(VIP_USERS_KEY, userId);
          await redis.set(
            `VIP_EXPIRES:${userId}`,
            Date.now() + 31 * 24 * 60 * 60 * 1000
          );
        }
      }

      return res.json({ received: true });
    }

    // =====================================================
    // AUTH – všetko ostatné vyžaduje JWT
    // =====================================================
    const userId = requireAuth(req, res);
    if (!userId) return;

    // =====================================================
    // 1) STATUS – je PREMIUM?
    // =====================================================
    if (task === "status") {
      const isVip = await redis.sismember(VIP_USERS_KEY, userId);

      return res.json({
        ok: true,
        userId,
        isVip: !!isVip,
      });
    }

    // =====================================================
    // 2) STRIPE – Checkout (subscription)
    // =====================================================
    if (task === "create_checkout_session") {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: "https://www.nhlpro.sk/?premium=success",
        cancel_url: "https://www.nhlpro.sk/?premium=cancel",
        metadata: {
          userId,
        },
      });

      return res.json({
        ok: true,
        url: session.url,
      });
    }

    // =====================================================
    // 3) GET_PLAYERS
    // =====================================================
    if (task === "get_players") {
      const key = vipPlayersKey(userId);
      const playersRaw = (await redis.hgetall(key)) || {};

      const players = {};
      let totalProfit = 0;

      for (const [name, raw] of Object.entries(playersRaw)) {
        const obj = normalizePlayer(safeParse(raw));
        players[name] = obj;
        totalProfit += obj.balance;
      }

      return res.json({
        ok: true,
        userId,
        players,
        totalProfit: Number(totalProfit.toFixed(2)),
      });
    }

// =====================================================
// 4) ADD_PLAYER  (VIP – vytvorí aj prázdnu HISTÓRIU)
// =====================================================
if (task === "add_player") {
  const fullName = req.query.name || null;
  const teamName = req.query.team || null;
  const oddsRaw = req.query.odds || null;

  if (!fullName || !teamName) {
    return res.status(400).json({
      ok: false,
      error: "Missing name or team",
    });
  }

  const odds = Number(oddsRaw);
  if (!odds || odds <= 1) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or missing odds",
    });
  }

  const teamAbbrev = TEAM_NAME_TO_ABBREV[teamName];
  if (!teamAbbrev) {
    return res.status(400).json({
      ok: false,
      error: `Unknown team name: ${teamName}`,
    });
  }

  const shortName = formatShortName(fullName);
  const now = todayISO();

  const playersKey = vipPlayersKey(userId);
  const historyKey = vipHistoryKey(userId, shortName);

  // ✅ ULOŽÍME AJ ODDS
  const playerState = {
    stake: 1,
    streak: 0,
    balance: 0,
    odds: odds,              // 🔥 TU BOL PROBLÉM
    started: now,
    lastUpdate: now,
    teamAbbrev,
  };

  await redis.hset(playersKey, {
    [shortName]: JSON.stringify(playerState),
  });

  return res.json({
    ok: true,
    player: shortName,
    odds,
  });
}

    // ------------------------------------------
// 4) DELETE_PLAYER – vymazanie hráča
// ------------------------------------------
if (task === "delete_player") {
  const player = req.query.player || null;

  if (!player) {
    return res.status(400).json({
      ok: false,
      error: "Missing player (use ?player=...)",
    });
  }

  const key = vipPlayersKey(userId);

  // zmaž hráča z VIP zoznamu
  await redis.hdel(key, player);

  // voliteľne: zmaž aj históriu hráča
  await redis.del(vipHistoryKey(userId, player));

  return res.json({
    ok: true,
    userId,
    deleted: player,
  });
}

    // =====================================================
    // 5) HISTORY
    // =====================================================
    if (task === "history") {
      const player = req.query.player;
      if (!player) {
        return res.status(400).json({
          ok: false,
          error: "Missing player (?player=...)",
        });
      }

      const key = vipHistoryKey(userId, player);
      const raw = await redis.get(key);
      let history = [];

      if (raw) {
        history = typeof raw === "string" ? JSON.parse(raw) : safeParse(raw);
        if (!Array.isArray(history)) history = [];
      }

      return res.json({
        ok: true,
        userId,
        player,
        history,
      });
    }

    // =====================================================
    // DEFAULT
    // =====================================================
    return res.json({
      ok: true,
      message:
        "VIP API ready. Use ?task=status|create_checkout_session|get_players|add_player|history",
    });
  } catch (err) {
    console.error("❌ VIP API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
