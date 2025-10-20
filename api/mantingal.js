// /api/mantingal.js
// Serverless Mantingal: state | reset (12:00) | update (10:00)

const USE_UPSTASH = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const KV_KEY = "mantingal_state_v1";

// Fallback: lokálny súbor pre dev (Vercel FS je read-only medzi requestami)
import fs from "fs/promises";
import path from "path";

async function kvGet() {
  if (USE_UPSTASH) {
    const resp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${KV_KEY}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      cache: "no-store",
    });
    const json = await resp.json();
    if (json.result) {
      try { return JSON.parse(json.result); } catch { return {}; }
    }
    return {};
  } else {
    try {
      const p = path.join(process.cwd(), "data", "mantingal.json");
      const raw = await fs.readFile(p, "utf8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

async function kvSet(obj) {
  if (USE_UPSTASH) {
    await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${KV_KEY}/${encodeURIComponent(JSON.stringify(obj))}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
    });
  } else {
    const dir = path.join(process.cwd(), "data");
    const p = path.join(dir, "mantingal.json");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(p, JSON.stringify(obj, null, 2), "utf8");
  }
}

// Helpers
function sortedTopNFromRatings(playerRatings = {}, n = 10) {
  return Object.entries(playerRatings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => name);
}

function normalizeName(s) {
  return String(s || "").trim();
}

function profitOnWin(stake, odds = 2.2) {
  // čistý zisk = stake * (odds - 1)
  return +(stake * (odds - 1)).toFixed(2);
}

// NHL helpers
function teamNameFromBox(boxTeam) {
  // ex: { placeName.default: 'Buffalo', commonName.default: 'Sabres' }
  const place = boxTeam?.placeName?.default || "";
  const common = boxTeam?.commonName?.default || "";
  return `${place} ${common}`.trim();
}

function collectSkatersFromSide(side) {
  // side.forwards/defense/goalies
  const list = [];
  ["forwards", "defense"].forEach(group => {
    (side?.[group] || []).forEach(p => {
      const name = p?.name?.default || "";
      const goals = p?.goals ?? 0;
      list.push({ name, goals });
    });
  });
  return list;
}

async function fetchBoxscore(gameId) {
  const url = `https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Boxscore ${gameId} status ${r.status}`);
  return r.json();
}

// ————————————————————————————————————————————————————————

export default async function handler(req, res) {
  try {
    const { action } = req.query || {};
    if (req.method === "GET" && action === "state") {
      const state = await kvGet();
      return res.status(200).json({ ok: true, state });
    }

    if (req.method === "POST" && action === "reset") {
      // 12:00 – zober TOP10 z /api/matches a nastav stake na dnes
      const origin = req.headers["x-forwarded-proto"]
        ? `${req.headers["x-forwarded-proto"]}://${req.headers.host}`
        : req.headers.origin || "";

      const resp = await fetch(`${origin}/api/matches`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`/api/matches failed: ${resp.status}`);
      const data = await resp.json();
      const ratings = data.playerRatings || {};

      const top10 = sortedTopNFromRatings(ratings, 10);

      const state = (await kvGet()) || {};
      state.players = state.players || {}; // map by player name

      top10.forEach(name => {
        const key = normalizeName(name);
        const rec = state.players[key] || { stake: 1, streak: 0, lastResult: "new", profit: 0 };
        // pre dnešnú stávku: ak včera win -> 1, ak loss -> dvojnásobok
        if (rec.lastResult === "loss") {
          rec.stake = Math.max(1, rec.stake * 2);
        } else {
          rec.stake = 1;
        }
        // označ hráča ako aktívny pre dnešok
        rec.activeToday = true;
        state.players[key] = rec;
      });

      // nepoužitých (mimo dnešnej TOP10) len odznačíme activeToday
      Object.keys(state.players).forEach(k => {
        if (!top10.includes(k)) state.players[k].activeToday = false;
      });

      await kvSet(state);
      return res.status(200).json({ ok: true, top10 });
    }

    if (req.method === "POST" && action === "update") {
      // 10:00 – skontroluj zápasy od včerajšej 10:00 do dnešnej 10:00 a vyhodnoť
      // zober zoznam odohraných zápasov z /api/matches
      const origin = req.headers["x-forwarded-proto"]
        ? `${req.headers["x-forwarded-proto"]}://${req.headers.host}`
        : req.headers.origin || "";

      const r = await fetch(`${origin}/api/matches`, { cache: "no-store" });
      if (!r.ok) throw new Error(`/api/matches failed: ${r.status}`);
      const mdata = await r.json();
      const matches = Array.isArray(mdata.matches) ? mdata.matches : [];

      // vyber včera->dnes (UTC) a len CLOSED
      const now = new Date();
      const end = now;
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const inWindow = matches.filter(m => {
        const st = (m.status || m.sport_event_status?.status || "").toLowerCase();
        const t = new Date(m.start_time || m.sport_event?.start_time || m.date);
        return st === "closed" && t >= start && t <= end && m.id;
      });

      // načítaj stav mantingalu
      const state = (await kvGet()) || {};
      state.players = state.players || {};
      const playerNames = Object.keys(state.players);

      // indexovaná pomocná mapa výsledkov hráčov za 24h = či dal gól
      const scored = Object.fromEntries(playerNames.map(p => [p, false]));

      // cez všetky boxscores za okno
      await Promise.all(
        inWindow.map(async g => {
          try {
            const box = await fetchBoxscore(g.id);
            const awayPlayers = collectSkatersFromSide(box.playerByGameStats?.awayTeam || {});
            const homePlayers = collectSkatersFromSide(box.playerByGameStats?.homeTeam || {});
            const all = [...homePlayers, ...awayPlayers];

            playerNames.forEach(pn => {
              const found = all.find(p => normalizeName(p.name) === pn && (p.goals || 0) > 0);
              if (found) scored[pn] = true;
            });
          } catch (e) {
            // boxscore mohol zlyhať – nepadáme kvôli jednému zápasu
            console.warn(`Boxscore ${g.id} error:`, e.message);
          }
        })
      );

      // vyhodnotenie
      const ODDS = 2.2;
      playerNames.forEach(pn => {
        const rec = state.players[pn];
        if (!rec) return;

        // len ak včera hral (niektoré dni nemusí)
        // heuristika: ak nenájdeme v boxscore, nič nemeníme
        if (scored[pn] === true) {
          // WIN
          rec.profit = +(rec.profit + profitOnWin(rec.stake, ODDS)).toFixed(2);
          rec.lastResult = "win";
          rec.streak = 0;
          rec.stake = 1; // reset na zajtra
        } else if (scored[pn] === false) {
          // LOSS
          rec.profit = +(rec.profit - rec.stake).toFixed(2);
          rec.lastResult = "loss";
          rec.streak = (rec.streak || 0) + 1;
          rec.stake = Math.max(1, rec.stake * 2); // zajtra dvojnásobok
        }
        state.players[pn] = rec;
      });

      await kvSet(state);
      return res.status(200).json({ ok: true, settled: scored });
    }
 // fallback
 
    // fallback
    return res.status(405).json({ ok: false, error: "Unsupported method/action" });
  } catch (err) {
    console.error("Mantingal API error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
