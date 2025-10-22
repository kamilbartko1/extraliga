// /api/mantingal.js
import fs from "fs/promises";
import path from "path";

const USE_UPSTASH =
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const KV_KEY = "mantingal_state_v1";
const DATA_FILE = path.join(process.cwd(), "data", "mantingal.json");

// ---------- helpers ----------
async function loadState() {
  try {
    if (USE_UPSTASH) {
      const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${KV_KEY}`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      });
      const j = await r.json();
      const s = j.result ? JSON.parse(j.result) : {};
      return { players: s.players || {}, history: s.history || [] };
    } else {
      const txt = await fs.readFile(DATA_FILE, "utf8");
      const s = JSON.parse(txt);
      return { players: s.players || {}, history: s.history || [] };
    }
  } catch {
    return { players: {}, history: [] };
  }
}

async function saveState(state) {
  try {
    const body = JSON.stringify(state, null, 2);
    if (USE_UPSTASH) {
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${KV_KEY}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } else {
      // write best-effort; if Vercel readonly, it will throw but we catch outside
      await fs.writeFile(DATA_FILE, body);
    }
  } catch (e) {
    console.warn("saveState warning:", e?.message || e);
  }
}

// ---------- rating helper ----------
async function getTop10PlayersFromMatches() {
  try {
    // voláme tvoj /api/matches (produkčnú URL)
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nhlpro.sk";
    const resp = await fetch(`${base}/api/matches`, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`matches fetch failed: ${resp.status}`);
    }
    const data = await resp.json();
    const players = data.playerRatings || {};
    const top10 = Object.entries(players)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
    return top10;
  } catch (err) {
    console.warn("getTop10PlayersFromMatches failed:", err?.message || err);
    return [];
  }
}

// ---------- utility: normalize ----------
function cleanName(s = "") {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/[\s\.]/g, "")
    .toLowerCase();
}

// parse a name like "J. Hughes" -> {first: "j", last: "hughes", fullClean: "j.hughes" ...}
function parseNameVariants(displayName) {
  const raw = String(displayName || "").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1].replace(/\./g, "") : "";
  const first = parts.length > 1 ? parts[0].replace(/\./g, "") : "";
  const initials = parts.map(p => p[0] || "").join("").toLowerCase();

  const variants = new Set();
  // full normalized
  variants.add(cleanName(raw));
  // firstlast and lastfirst
  if (first && last) {
    variants.add(cleanName(`${first} ${last}`));
    variants.add(cleanName(`${last} ${first}`));
  }
  // initial + last
  if (first && last) {
    variants.add(cleanName(`${first[0]}${last}`));
    variants.add(cleanName(`${first[0]}.${last}`));
    variants.add(cleanName(`${initials}${last}`));
  }
  // last only
  if (last) variants.add(cleanName(last));

  return { raw, first, last, initials, variants: Array.from(variants) };
}

// ---------- actions ----------
async function getState() {
  let state = await loadState();

  if (!state.players || Object.keys(state.players).length === 0) {
    const top10 = await getTop10PlayersFromMatches();

    if (!top10.length) {
      return { ok: true, state: { players: {}, history: [] } };
    }

    const players = {};
    for (const name of top10) {
      players[name] = {
        stake: 1,
        profit: 0,
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    }

    state = { players, history: [] };
    await saveState(state);
    return { ok: true, state };
  }

  return { ok: true, state };
}

// ---------- UPDATE – reálne výsledky z gólov (robustné porovnanie mien) ----------
async function doUpdate() {
  const state = await loadState();
  const players = state.players || {};
  let dailyProfit = 0;
  const FIXED_ODDS = 2.2;

  // 1) načítaj aktuálne (score now). fallback: last 2 dni
  let games = [];
  try {
    const resp = await fetch("https://api-web.nhle.com/v1/score/now");
    if (resp.ok) {
      const d = await resp.json();
      games = Array.isArray(d.games) ? d.games : d.games || [];
    } else {
      // fallback: posledné 2 dni - podobne ako doteraz
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const days = [yesterday.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
      for (const day of days) {
        try {
          const r = await fetch(`https://api-web.nhle.com/v1/score/${day}`);
          if (!r.ok) continue;
          const dd = await r.json();
          const gs = Array.isArray(dd.games) ? dd.games : dd.games || [];
          games.push(...gs);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("⚠️ Chyba pri fetchnutí /score/now:", err.message);
  }

  // deduplicate games by id
  const gamesMap = {};
  for (const g of games || []) {
    if (!g || !g.id) continue;
    gamesMap[g.id] = g;
  }
  games = Object.values(gamesMap);

  console.log(`📅 Načítaných ${games.length} zápasov (doUpdate)`);

  // 2) zhojmaždíme góly (strelci)
  const scorers = []; // objekt s čisteným menom a displayom a team
  for (const g of games) {
    try {
      // ak games obsahuje `goals` priamo (niekedy áno), použijeme; inak musí ísť cez boxscore
      if (Array.isArray(g.goals) && g.goals.length > 0) {
        for (const goal of g.goals) {
          const first = goal.firstName?.default || "";
          const last = goal.lastName?.default || "";
          if (!first && !last) continue;
          const full = `${first} ${last}`.trim();
          scorers.push({
            clean: cleanName(full),
            display: full,
            team: goal.teamAbbrev || (goal.team && (goal.team.abbrev || "")) || "",
          });
        }
      } else {
        // pokus o boxscore pre tento game id
        try {
          const r = await fetch(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`);
          if (!r.ok) continue;
          const box = await r.json();
          // extract goals from `goals` if present
          const goals = box?.scoringPlays || box?.goals || [];
          // scoringPlays/ goals structure vary; prefer `goals` from top-level if it exists
          const useGoals = Array.isArray(box.goals) ? box.goals : Array.isArray(goals) ? goals : [];
          for (const goal of useGoals) {
            const first = goal.firstName?.default || goal.name?.default?.split(" ")?.[0] || "";
            const last = goal.lastName?.default || goal.name?.default?.split(" ")?.slice(-1)?.[0] || "";
            if (!first && !last) continue;
            const full = `${first} ${last}`.trim();
            scorers.push({ clean: cleanName(full), display: full, team: goal.teamAbbrev || "" });
          }
        } catch (e) {
          // ignore one game boxscore failure
        }
      }
    } catch (err) {
      // ignore single-game parse error
    }
  }

  // unique scorers by clean name
  const scorerSet = new Map();
  for (const s of scorers) {
    if (!s || !s.clean) continue;
    if (!scorerSet.has(s.clean)) scorerSet.set(s.clean, s);
  }

  console.log(`📊 Nájdených unikátnych strelcov: ${scorerSet.size}`);

  // 3) pre každý sledovaný hráč vytvoríme varianty a porovnáme
  function didPlayerScore(playerName) {
    if (!playerName) return false;
    const parsed = parseNameVariants(playerName);
    // 1) presná zhodná normalizácia
    for (const v of parsed.variants) {
      if (scorerSet.has(v)) return true;
    }
    // 2) partial matching: last name match + first initial match
    const lastClean = cleanName(parsed.last || "");
    const firstInitial = (parsed.first && parsed.first[0]?.toLowerCase()) || "";
    if (lastClean) {
      // search scorers with same last substring
      for (const s of scorerSet.values()) {
        // check last name included and first initial equals
        if (s.clean.includes(lastClean)) {
          // attempt to extract scorer first initial from display
          const parts = String(s.display || "").split(/\s+/).filter(Boolean);
          const scorerFirst = parts.length > 0 ? parts[0].replace(/\./g, "") : "";
          if (!firstInitial) return true; // if we don't have first, last name match enough
          if (scorerFirst[0]?.toLowerCase() === firstInitial) return true;
        }
      }
    }
    // 3) fallback: any scorer includes player's cleaned string
    const playerClean = cleanName(playerName);
    for (const s of scorerSet.values()) {
      if (s.clean.includes(playerClean) || playerClean.includes(s.clean)) return true;
    }

    return false;
  }

  // 4) vyhodnotenie Mantingalu
  for (const [name, p] of Object.entries(players)) {
    if (!p.activeToday) continue;

    const scored = didPlayerScore(name);
    if (scored) {
      // win: zisk podla stake * (odds -1)
      const winProfit = Number((p.stake * (FIXED_ODDS - 1)).toFixed(2));
      p.profit = Number((Number(p.profit || 0) + winProfit).toFixed(2));
      p.lastResult = "win";
      p.streak = 0;
      p.stake = 1;
      dailyProfit += winProfit;
      console.log(`✅ ${name} skóroval. +${winProfit.toFixed(2)} €`);
    } else {
      // loss: odcitam aktuálnu stake (pred zdvojnásobením)
      const lossAmount = Number((p.stake || 0));
      p.profit = Number((Number(p.profit || 0) - lossAmount).toFixed(2));
      p.lastResult = "loss";
      p.streak = (p.streak || 0) + 1;
      p.stake = Number((p.stake || 1) * 2);
      dailyProfit -= lossAmount;
      console.log(`❌ ${name} neskóroval. -${lossAmount.toFixed(2)} €, nový stake: ${p.stake}`);
    }
  }

  // 5) uloženie histórie a stavu
  state.history = state.history || [];
  state.history.push({
    date: new Date().toISOString().slice(0, 10),
    profit: Number(dailyProfit.toFixed(2)),
  });

  await saveState(state);
  return { ok: true, message: "Update hotový", dailyProfit: Number(dailyProfit.toFixed(2)) };
}

// ---------- RESET ----------
async function doReset() {
  const state = await loadState();
  const top10 = await getTop10PlayersFromMatches();

  Object.values(state.players || {}).forEach((p) => (p.activeToday = false));

  for (const name of top10) {
    if (!state.players) state.players = {};
    if (!state.players[name]) {
      state.players[name] = {
        stake: 1,
        profit: 0,
        lastResult: null,
        streak: 0,
        activeToday: true,
      };
    } else {
      const p = state.players[name];
      p.activeToday = true;
      if (p.lastResult === "win") p.stake = 1;
    }
  }

  await saveState(state);
  return { ok: true, message: "Reset hotový", active: top10 };
}

// ---------- handler ----------
export default async function handler(req, res) {
  const action = req.query.action || req.body?.action || "state";
  try {
    if (action === "state") return res.status(200).json(await getState());
    if (action === "update") return res.status(200).json(await doUpdate());
    if (action === "reset") return res.status(200).json(await doReset());
    return res.status(400).json({ error: "Neznáma akcia" });
  } catch (e) {
    console.error("mantingal error:", e);
    return res.status(500).json({ error: e.message || "Mantingal error" });
  }
}
