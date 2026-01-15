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
const vipTotalProfitKey = (userId) => `VIP_TOTAL_PROFIT:${userId}`;
const vipTotalStakedKey = (userId) => `VIP_TOTAL_STAKED:${userId}`;
const vipUsernameKey = (userId) => `VIP_USERNAME:${userId}`;

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

// ===============================
// New Helper for Leaderboard
// ===============================
async function calculateUserStats(userId) {
  // 1. Load active players
  const playersKey = vipPlayersKey(userId);
  const playersRaw = (await redis.hgetall(playersKey)) || {};

  let currentPlayersProfit = 0;
  for (const raw of Object.values(playersRaw)) {
    const obj = normalizePlayer(safeParse(raw));
    currentPlayersProfit += obj.balance;
  }

  // 2. Load archived profit
  const archivedProfitRaw = await redis.get(vipTotalProfitKey(userId));
  const archivedProfit = archivedProfitRaw ? Number(archivedProfitRaw) : 0;

  // 3. Total Profit
  const totalProfit = archivedProfit + currentPlayersProfit;

  return {
    userId,
    totalProfit: Number(totalProfit.toFixed(2)),
    activePlayersCount: Object.keys(playersRaw).length
  };
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

          // Ulož subscription ID ak je dostupné
          if (session.subscription) {
            await redis.set(`VIP_SUBSCRIPTION:${userId}`, session.subscription);
          }
        }
      }

      // Zachyť subscription.created event pre uloženie subscription ID
      if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Nájdeme userId podľa customer ID (musíme uložiť customer ID pri checkout)
        // Alebo použijeme metadata z checkout session
        // Pre jednoduchosť použijeme customer email alebo metadata
        if (subscription.metadata?.userId) {
          const userId = subscription.metadata.userId;
          await redis.set(`VIP_SUBSCRIPTION:${userId}`, subscription.id);
        } else {
          // Skús nájsť userId podľa customer ID
          try {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer.metadata?.userId) {
              await redis.set(`VIP_SUBSCRIPTION:${customer.metadata.userId}`, subscription.id);
            }
          } catch (e) {
            console.warn("Could not retrieve customer:", e.message);
          }
        }
      }

      // Zachyť subscription.deleted alebo canceled
      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.metadata?.userId) {
            const userId = customer.metadata.userId;
            await redis.srem(VIP_USERS_KEY, userId);
            await redis.del(`VIP_SUBSCRIPTION:${userId}`);
            await redis.del(`VIP_EXPIRES:${userId}`);
          }
        } catch (e) {
          console.warn("Could not process subscription deletion:", e.message);
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
    // 1.5) SET USERNAME – uloženie prezývky
    // =====================================================
    if (task === "set_username") {
      const username = req.query.username || req.body?.username;

      if (!username || username.trim().length === 0) {
        return res.json({ ok: false, error: "Username is required" });
      }

      // Sanitize username (max 20 chars, alphanumeric + underscore)
      const sanitized = username.trim().substring(0, 20).replace(/[^a-zA-Z0-9_]/g, '');

      if (sanitized.length < 2) {
        return res.json({ ok: false, error: "Username must be at least 2 characters" });
      }

      // Skontroluj, či už používateľ má nastavenú prezývku
      const existing = await redis.get(vipUsernameKey(userId));
      if (existing) {
        return res.json({ ok: false, error: "Username is already set and cannot be changed" });
      }

      await redis.set(vipUsernameKey(userId), sanitized);

      return res.json({ ok: true, username: sanitized });
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
        subscription_data: {
          metadata: {
            userId,
          },
        },
      });

      return res.json({
        ok: true,
        url: session.url,
      });
    }

    // =====================================================
    // 2.5) CANCEL SUBSCRIPTION
    // =====================================================
    if (task === "cancel_subscription") {
      // Nájdeme subscription ID pre používateľa
      const subscriptionId = await redis.get(`VIP_SUBSCRIPTION:${userId}`);

      if (!subscriptionId) {
        // Skús nájsť subscription cez Stripe API
        try {
          const subscriptions = await stripe.subscriptions.list({
            limit: 100,
          });

          // Nájdeme subscription s userId v metadata
          const userSubscription = subscriptions.data.find(sub =>
            sub.metadata?.userId === userId
          );

          if (!userSubscription) {
            return res.status(404).json({
              ok: false,
              error: "Subscription not found",
            });
          }

          // Zruš subscription
          const canceled = await stripe.subscriptions.cancel(userSubscription.id);

          // Odstráň z Redis
          await redis.srem(VIP_USERS_KEY, userId);
          await redis.del(`VIP_SUBSCRIPTION:${userId}`);
          await redis.del(`VIP_EXPIRES:${userId}`);

          return res.json({
            ok: true,
            message: "Subscription canceled successfully",
            canceled_at: canceled.canceled_at,
          });
        } catch (err) {
          console.error("Error canceling subscription:", err);
          return res.status(500).json({
            ok: false,
            error: err.message,
          });
        }
      }

      // Zruš subscription
      try {
        const canceled = await stripe.subscriptions.cancel(subscriptionId);

        // Odstráň z Redis
        await redis.srem(VIP_USERS_KEY, userId);
        await redis.del(`VIP_SUBSCRIPTION:${userId}`);
        await redis.del(`VIP_EXPIRES:${userId}`);

        return res.json({
          ok: true,
          message: "Subscription canceled successfully",
          canceled_at: canceled.canceled_at,
        });
      } catch (err) {
        console.error("Error canceling subscription:", err);
        return res.status(500).json({
          ok: false,
          error: err.message,
        });
      }
    }

    // =====================================================
    // 3) GET_PLAYERS
    // =====================================================
    if (task === "get_players") {
      const key = vipPlayersKey(userId);
      const playersRaw = (await redis.hgetall(key)) || {};

      const players = {};
      let currentPlayersProfit = 0;

      for (const [name, raw] of Object.entries(playersRaw)) {
        const obj = normalizePlayer(safeParse(raw));
        players[name] = obj;
        currentPlayersProfit += obj.balance;
      }

      // Načítaj uložený profit z vymazaných hráčov
      const archivedProfitRaw = await redis.get(vipTotalProfitKey(userId));
      const archivedProfit = archivedProfitRaw ? Number(archivedProfitRaw) : 0;

      // Celkový profit = profit vymazaných hráčov + profit aktuálnych hráčov
      const totalProfit = archivedProfit + currentPlayersProfit;

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
      const totalProfitKey = vipTotalProfitKey(userId);

      // Pred vymazaním: načítaj balance hráča a ulož ho do total profit
      const playerRaw = await redis.hget(key, player);
      if (playerRaw) {
        try {
          const playerObj = normalizePlayer(safeParse(playerRaw));
          const playerBalance = playerObj.balance || 0;

          // Načítaj aktuálny total profit (profit z vymazaných hráčov)
          const currentTotalProfitRaw = await redis.get(totalProfitKey);
          const currentTotalProfit = currentTotalProfitRaw ? Number(currentTotalProfitRaw) : 0;

          // Pridaj balance vymazaného hráča do total profit
          const newTotalProfit = currentTotalProfit + playerBalance;
          await redis.set(totalProfitKey, newTotalProfit.toString());

          // 4.1) ARCHIVÁCIA STAKED sumy (aby sedelo ROI)
          // ----------------------------------------------------
          const histKey = vipHistoryKey(userId, player);
          const rawHist = await redis.get(histKey);
          let playerTotalStaked = 0;

          if (rawHist) {
            let hist = [];
            try {
              hist = typeof rawHist === "string" ? JSON.parse(rawHist) : safeParse(rawHist);
              if (Array.isArray(hist)) {
                hist.forEach(h => {
                  // ROBUSTNÝ VÝPOČET (rovnaký ako v dashboarde)
                  if (h.result === 'miss' && h.profitChange) {
                    playerTotalStaked += Math.abs(Number(h.profitChange));
                  } else if (h.result === 'hit') {
                    if (h.stake) {
                      playerTotalStaked += Number(h.stake);
                    } else if (h.profitChange && h.odds) {
                      playerTotalStaked += Number(h.profitChange) / (Number(h.odds) - 1);
                    }
                  }
                });
              }
            } catch (e) {
              console.warn("❌ Error parsing history for staked calc:", e);
            }
          }

          if (playerTotalStaked > 0) {
            const stakedKey = vipTotalStakedKey(userId);
            const currentTotalStakedRaw = await redis.get(stakedKey);
            const currentTotalStaked = currentTotalStakedRaw ? Number(currentTotalStakedRaw) : 0;
            const newTotalStaked = currentTotalStaked + playerTotalStaked;
            await redis.set(stakedKey, newTotalStaked.toString());
          }
          // ----------------------------------------------------
        } catch (e) {
          console.error("❌ Error saving player balance to total profit:", e.message);
          // Pokračuj aj keď sa to nepodarí - hráč sa vymaže, ale total profit zostane nezmenený
        }
      }

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
    // 6) DASHBOARD – Osobný dashboard s profit trackingom
    // =====================================================
    if (task === "dashboard") {
      // AS Stratégia dáta
      const playersKey = vipPlayersKey(userId);
      const playersRaw = (await redis.hgetall(playersKey)) || {};

      const players = {};
      let currentPlayersProfit = 0;

      for (const [name, raw] of Object.entries(playersRaw)) {
        const obj = normalizePlayer(safeParse(raw));
        players[name] = obj;
        currentPlayersProfit += obj.balance;
      }

      // Načítaj uložený profit z vymazaných hráčov
      const archivedProfitRaw = await redis.get(vipTotalProfitKey(userId));
      const archivedProfit = archivedProfitRaw ? Number(archivedProfitRaw) : 0;

      // Celkový profit = profit vymazaných hráčov + profit aktuálnych hráčov
      const totalProfit = archivedProfit + currentPlayersProfit;

      // VIP tipy úspešnosť (z AI histórie - pre teraz základné dáta)
      // TODO: V budúcnosti pridať tracking VIP tipov úspešnosti
      const vipTipsStats = {
        total: 0,
        hits: 0,
        misses: 0,
        successRate: 0
      };

      // Dátum registrácie (z VIP_EXPIRES - odpočítame 31 dní)
      const expiresRaw = await redis.get(`VIP_EXPIRES:${userId}`);
      let memberSince = null;
      if (expiresRaw) {
        try {
          const expiresTimestamp = Number(expiresRaw);
          // Odpočítame 31 dní (mesačné predplatné)
          const memberSinceTimestamp = expiresTimestamp - (31 * 24 * 60 * 60 * 1000);
          memberSince = new Date(memberSinceTimestamp).toISOString().split('T')[0];
        } catch (e) {
          console.warn("Could not parse VIP_EXPIRES:", e.message);
        }
      }

      // ROI výpočet - prejdeme všetkých hráčov a ich históriu
      let totalStaked = 0;

      // 1) Pripočítaj archivované vklady (z vymazaných hráčov)
      const archivedStakedRaw = await redis.get(vipTotalStakedKey(userId));
      if (archivedStakedRaw) {
        totalStaked += Number(archivedStakedRaw);
      }

      // 2) Pripočítaj vklady aktuálnych hráčov
      for (const [name, player] of Object.entries(players)) {
        const historyKey = vipHistoryKey(userId, name);
        const rawHist = await redis.get(historyKey);
        let hist = [];

        if (rawHist) {
          try {
            hist = typeof rawHist === "string" ? JSON.parse(rawHist) : safeParse(rawHist);
            if (!Array.isArray(hist)) hist = [];
          } catch {
            hist = [];
          }
        }

        // Prejdeme históriu a spočítame všetky stake
        hist.forEach(h => {
          if (h.stake !== undefined && h.stake !== null) {
            totalStaked += Number(h.stake);
          }
        });
      }

      // ROI = (celkový profit / celkový vklad) * 100
      const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

      // Načítaj prezývku
      const username = await redis.get(vipUsernameKey(userId)) || null;

      return res.json({
        ok: true,
        userId,
        username, // Pridané
        dashboard: {
          asStrategy: {
            totalProfit: Number(totalProfit.toFixed(2)),
            activePlayers: Object.keys(players).length,
            roi: Number(roi.toFixed(2)),
            totalStaked: Number(totalStaked.toFixed(2))
          },
          vipTips: vipTipsStats,
          memberSince,
          summary: {
            totalValue: Number(totalProfit.toFixed(2))
          }
        }
      });
    }

    // =====================================================
    // 7) LEADERBOARD & COMPARISON
    // =====================================================
    if (task === "leaderboard") {
      // 1. Get all VIP users
      const vipUsers = await redis.smembers(VIP_USERS_KEY);

      let allStats = [];
      let totalVipProfit = 0;

      // 2. Calculate stats for each user (Parallel for speed)
      const statsPromises = vipUsers.map(uid => calculateUserStats(uid));
      const results = await Promise.all(statsPromises);

      results.forEach(stat => {
        allStats.push(stat);
        totalVipProfit += stat.totalProfit;
      });

      // 3. Sort by Profit Descending
      allStats.sort((a, b) => b.totalProfit - a.totalProfit);

      // 4. Calculate Average
      const averageProfit = vipUsers.length > 0 ? (totalVipProfit / vipUsers.length) : 0;

      // 5. Find Current User Rank and Stats
      const myIndex = allStats.findIndex(s => s.userId === userId);
      const myStats = allStats[myIndex] || { totalProfit: 0, activePlayersCount: 0 };
      const myRank = myIndex + 1;

      // 6. Get Top 10 with usernames
      const top10Stats = allStats.slice(0, 10);

      // Fetch usernames for top 10 users
      const usernamePromises = top10Stats.map(s => redis.get(vipUsernameKey(s.userId)));
      const usernames = await Promise.all(usernamePromises);

      const topList = top10Stats.map((s, index) => {
        const username = usernames[index] || null;
        let displayName;

        if (s.userId === userId) {
          displayName = "TY (You)";
        } else if (username) {
          displayName = username;
        } else {
          displayName = `Anonymous #${index + 1}`;
        }

        return {
          rank: index + 1,
          profit: s.totalProfit,
          isCurrentUser: s.userId === userId,
          name: displayName
        };
      });

      // 7. Calculate Diff from Average (Percentage)
      let diffPercent = 0;
      if (averageProfit === 0) {
        diffPercent = myStats.totalProfit > 0 ? 100 : 0;
      } else {
        diffPercent = ((myStats.totalProfit - averageProfit) / Math.abs(averageProfit)) * 100;
      }

      return res.json({
        ok: true,
        leaderboard: topList,
        userStats: {
          rank: myRank,
          profit: myStats.totalProfit,
          averageProfit: Number(averageProfit.toFixed(2)),
          diffPercent: Number(diffPercent.toFixed(1)),
          totalVips: vipUsers.length
        }
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
