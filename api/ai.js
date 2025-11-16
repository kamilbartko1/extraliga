// /api/ai.js
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// 1️⃣ pomocná funkcia – zavolá pôvodný AI výpočet
async function computeAIScorer(baseUrl) {
  const resp = await fetch(`${baseUrl}/api/ai-scorer`);
  return await resp.json();
}

// 2️⃣ uloženie strelca do Upstash
async function saveAIScorer(baseUrl) {
  const data = await computeAIScorer(baseUrl);

  if (!data.ok || !data.aiScorerTip) return { ok: false };

  const today = new Date().toISOString().slice(0, 10);
  const entry = { date: today, ...data.aiScorerTip, result: "pending" };

  await redis.lpush("ai_tips_history", JSON.stringify(entry));

  return { ok: true, saved: entry };
}

// 3️⃣ hodnotenie či hráč dal gól
async function evaluateAIScorer() {
  const history = await redis.lrange("ai_tips_history", 0, -1);
  if (!history.length) return { ok: false };

  const items = history.map(x => JSON.parse(x));
  const last = items[0];
  const date = last.date;
  const playerName = last.player;

  const url = `https://api-web.nhle.com/v1/score/${date}`;
  const resp = await fetch(url);
  const data = await resp.json();

  let scored = false;

  for (const game of data.games || []) {
    const allPlayers = [
      ...(game.homeTeam?.players || []),
      ...(game.awayTeam?.players || [])
    ];

    for (const p of allPlayers) {
      const name = `${p.firstName?.default || ""} ${p.lastName?.default || ""}`.trim();
      if (name.toLowerCase() === playerName.toLowerCase()) {
        if (p.goals > 0) scored = true;
      }
    }
  }

  last.result = scored ? "win" : "loss";
  await redis.lset("ai_tips_history", 0, JSON.stringify(last));

  return { ok: true, updated: last };
}

// 4️⃣ história + percento úspešnosti
async function historyAIScorer() {
  const history = await redis.lrange("ai_tips_history", 0, -1);
  const items = history.map(x => JSON.parse(x));

  const wins = items.filter(i => i.result === "win").length;
  const total = items.filter(i => i.result !== "pending").length;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return {
    ok: true,
    total,
    wins,
    successRate: rate,
    history: items
  };
}

// ======================================================
// 🟢 HLAVNÝ ROUTER (1 serverless funkcia, 4 endpointy)
// ======================================================
export default async function handler(req, res) {
  const task = req.query.task || "";

  const baseUrl = `${req.headers["x-forwarded-proto"]}://${req.headers.host}`;

  try {
    if (task === "scorer") return res.json(await computeAIScorer(baseUrl));
    if (task === "save") return res.json(await saveAIScorer(baseUrl));
    if (task === "eval") return res.json(await evaluateAIScorer());
    if (task === "history") return res.json(await historyAIScorer());

    return res.json({ ok: false, error: "Neznáma úloha" });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
}
