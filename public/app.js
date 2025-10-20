// public/app.js

let teamRatings = {};
let playerRatings = {};
let allMatches = [];

const BASE_STAKE = 1;
const ODDS = 2.5;
const API_BASE = "";

// === Nastavenie dátumov pre sezónu 2025/26 ===
const START_DATE = "2025-10-08"; // prvé zápasy novej sezóny
const TODAY = new Date().toISOString().slice(0, 10); // dnešný dátum

// === Pomocné funkcie ===
const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
const slug = (s) => encodeURIComponent(String(s || "").toLowerCase().replace(/\s+/g, "-"));

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function* dateRange(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    yield formatDate(d);
  }
}

// === Normalizácia dát NHL API na formát appky ===
function nhlTeamName(t) {
  if (!t) return "Neznámy tím";
  const place = t.placeName?.default || "";
  const common = t.commonName?.default || "";
  const combo = `${place} ${common}`.trim();
  return combo || t.triCode || t.abbrev || "Tím";
}

function normalizeNhlGame(game, day) {
  let status = "not_started";
  const st = String(game.gameState || "").toUpperCase();
  if (st === "FINAL" || st === "OFF") status = "closed";
  else if (st === "LIVE") status = "ap";

  const homeScore = game.homeTeam?.score ?? 0;
  const awayScore = game.awayTeam?.score ?? 0;

  return {
    id: game.id,
    sport_event: {
      id: String(game.id || ""),
      start_time: game.startTimeUTC || game.startTime || day,
      competitors: [
        { id: String(game.homeTeam?.id || "HOME"), name: nhlTeamName(game.homeTeam) },
        { id: String(game.awayTeam?.id || "AWAY"), name: nhlTeamName(game.awayTeam) }
      ]
    },
    sport_event_status: {
      status,
      home_score: homeScore,
      away_score: awayScore,
      overtime: false,
      ap: status === "ap"
    },
    _day: day
  };
}

// === Fetch schedule od 8.10.2025 do dnes ===
async function fetchNhlSchedule() {
  const games = [];
  for (const day of dateRange(START_DATE, TODAY)) {
    try {
      const url = `https://api-web.nhle.com/v1/schedule/${day}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const groups = Array.isArray(data.gameWeek) ? data.gameWeek : [];
      groups.forEach(g => {
        const dayGames = Array.isArray(g.games) ? g.games : [];
        dayGames.forEach(game => {
          if (["FINAL", "OFF"].includes(String(game.gameState || "").toUpperCase())) {
            games.push(normalizeNhlGame(game, day));
          }
        });
      });
      console.log(`✅ ${day} – načítané ${games.length} zápasov`);
    } catch (e) {
      console.warn(`⚠️ Chyba pri dni ${day}: ${e.message}`);
    }
  }
  console.log(`🔹 Spolu odohraných zápasov: ${games.length}`);
  return games;
}

// === Výpočet ratingov tímov ===
function computeTeamRatings(matches) {
  const START_RATING = 1500;
  const GOAL_POINTS = 10;
  const WIN_POINTS = 10;
  const LOSS_POINTS = -10;

  const ratings = {};
  const ensure = (team) => { if (ratings[team] == null) ratings[team] = START_RATING; };

  matches.forEach(m => {
    const home = m.sport_event.competitors[0].name;
    const away = m.sport_event.competitors[1].name;
    const hs = m.sport_event_status.home_score ?? 0;
    const as = m.sport_event_status.away_score ?? 0;

    ensure(home); ensure(away);

    ratings[home] += hs * GOAL_POINTS - as * GOAL_POINTS;
    ratings[away] += as * GOAL_POINTS - hs * GOAL_POINTS;

    if (hs > as) {
      ratings[home] += WIN_POINTS;
      ratings[away] += LOSS_POINTS;
    } else if (as > hs) {
      ratings[away] += WIN_POINTS;
      ratings[home] += LOSS_POINTS;
    }
  });

  return ratings;
}

// === Hlavné načítanie ===
// ========================= API načítanie =========================
async function fetchMatches() {
  try {
    const response = await fetch(`${API_BASE}/api/matches`);
    const data = await response.json();

    console.log("✅ Dáta z backendu:", data);

    // NHL formát – očakávame pole data.matches
    const matches = Array.isArray(data.matches) ? data.matches : [];

    if (matches.length === 0) {
      console.warn("⚠️ Žiadne zápasy v data.matches");
    }

    // pre transformáciu do pôvodného tvaru
    const normalized = matches.map((g) => ({
      id: g.id,
      date: g.date,
      sport_event: {
        start_time: g.start_time,
        competitors: [
          { name: g.home_team },
          { name: g.away_team }
        ]
      },
      sport_event_status: {
        status: g.status,
        home_score: g.home_score,
        away_score: g.away_score
      }
    }));

    allMatches = normalized; // pre Mantingal

    // pre tabuľku zápasov
    const simplified = normalized.map((m) => ({
      id: m.id,
      home_team: m.sport_event.competitors[0].name,
      away_team: m.sport_event.competitors[1].name,
      home_score: m.sport_event_status.home_score,
      away_score: m.sport_event_status.away_score,
      status: m.sport_event_status.status,
      date: new Date(m.sport_event.start_time).toISOString().slice(0, 10)
    }));

    simplified.sort((a, b) => new Date(b.date) - new Date(a.date));

    displayMatches(simplified);

    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};

    displayTeamRatings();
    displayPlayerRatings();
    displayMantingal();
  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
  }
}

// === Zápasy ===
function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (!matches.length) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  const grouped = {};
  matches.forEach(m => {
    if (!grouped[m.date]) grouped[m.date] = [];
    grouped[m.date].push(m);
  });

  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  days.forEach((day, i) => {
    const roundRow = document.createElement("tr");
    roundRow.innerHTML = `<td colspan="4"><b>${i + 1}. deň (${day})</b></td>`;
    tableBody.appendChild(roundRow);

    grouped[day].forEach(match => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${match.home_team}</td>
        <td>${match.away_team}</td>
        <td>${match.home_score} : ${match.away_score}</td>
        <td>${match.status === "closed" ? "✅" : "🟡"}</td>
      `;
      tableBody.appendChild(row);
    });
  });
}

// === Rating tímov ===
function displayTeamRatings() {
  const tableBody = document.querySelector("#teamRatings tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const sorted = Object.entries(teamRatings).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([team, rating]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${team}</td><td>${rating}</td>`;
    tableBody.appendChild(row);
  });
}

// === Rating hráčov ===
function displayPlayerRatings() {
  const tableBody = document.querySelector("#playerRatings tbody");
  if (!tableBody) return;

  if (!playerRatings || Object.keys(playerRatings).length === 0) {
    tableBody.innerHTML = `<tr><td colspan="2">Dáta hráčov zatiaľ nepripojené</td></tr>`;
    return;
  }

  // Zoradíme hráčov podľa ratingu (od najlepšieho)
  const sorted = Object.entries(playerRatings).sort((a, b) => b[1] - a[1]);

  tableBody.innerHTML = ""; // vyčisti tabuľku

  sorted.forEach(([player, rating], index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}. ${player}</td>
      <td>${rating}</td>
    `;
    tableBody.appendChild(row);
  });
}

// === Mantingal placeholder ===
function displayMantingal() {
  const wrap = document.getElementById("mantingal-container");
  if (!wrap) return;
  wrap.innerHTML = `
    <table><tr><td>Mantingal sa zapne po pripojení hráčskych štatistík (boxscore).</td></tr></table>
  `;
}

// === Predikcie – Kurzy bookmakerov ===
async function displayPredictions() {
  const container = document.getElementById("predictions-section");
  if (!container) return;

  container.innerHTML = `
    <h2>Predikcie – Kurzy bookmakerov</h2>
    <p>Načítavam aktuálne kurzy...</p>
  `;

  try {
    const resp = await fetch("/api/predictions");
    const data = await resp.json();

    if (!data.games?.length) {
      container.innerHTML = "<p>Žiadne dostupné kurzy</p>";
      return;
    }

    const list = document.createElement("div");
    list.className = "odds-blocks";

    data.games.forEach(game => {
      const home = game.homeTeam || "-";
      const away = game.awayTeam || "-";
      const homeLogo = game.homeLogo || "";
      const awayLogo = game.awayLogo || "";
      const homeOdds = game.homeOdds ?? "-";
      const awayOdds = game.awayOdds ?? "-";

      const match = document.createElement("div");
      match.className = "odds-match";
      match.innerHTML = `
        <div class="match-header">
          <img src="${homeLogo}" alt="${home}" class="team-logo">
          <span class="team-name">${home}</span>
          <span class="vs">–</span>
          <span class="team-name">${away}</span>
          <img src="${awayLogo}" alt="${away}" class="team-logo">
        </div>

        <div class="odds-row">
          <div class="odds-cell"><b>1</b><br>${homeOdds}</div>
          <div class="odds-cell"><b>2</b><br>${awayOdds}</div>
        </div>
      `;
      list.appendChild(match);
    });

    container.innerHTML = `<h2>Predikcie – Kurzy bookmakerov</h2>`;
    container.appendChild(list);

  } catch (err) {
    console.error("❌ Chyba pri načítaní predikcií:", err);
    container.innerHTML = `<p>Chyba pri načítaní kurzov: ${err.message}</p>`;
  }
}

// 🔁 Načítaj predikcie, keď sa otvorí sekcia
document
  .querySelector("button[onclick*='predictions-section']")
  ?.addEventListener("click", displayPredictions);

  // === Mantingal – UI & API ===
async function fetchMantingalState() {
  try {
    const r = await fetch("/api/mantingal?action=state", { cache: "no-store" });
    const data = await r.json();
    return data.state || {};
  } catch (e) {
    console.warn("Mantingal state error:", e);
    return {};
  }
}

function renderMantingal(state) {
  const wrapMobile = document.getElementById("mantingal-container");
  const wrapPc = document.getElementById("mantingal-container-pc");
  const target = wrapPc || wrapMobile;
  if (!target) return;

  const players = Object.entries(state.players || {});

  if (!players.length) {
    target.innerHTML = `
      <div class="details-box">
        Mantingal zatiaľ nemá hráčov. Spusť <b>Pridať dnešnú TOP10</b> (12:00).
      </div>
      ${mantBtnsHtml()}
    `;
    return;
  }

  const rows = players
    .sort((a, b) => (b[1].profit ?? 0) - (a[1].profit ?? 0))
    .map(([name, rec], i) => `
      <tr>
        <td>${i + 1}.</td>
        <td>${name}</td>
        <td>${(rec.stake ?? 1).toFixed ? rec.stake.toFixed(2) : rec.stake} €</td>
        <td>${rec.lastResult === "win" ? "✅" : rec.lastResult === "loss" ? "❌" : "-"}</td>
        <td>${rec.streak ?? 0}</td>
        <td>${(rec.profit ?? 0).toFixed ? rec.profit.toFixed(2) : rec.profit} €</td>
        <td>${rec.activeToday ? "🟢 dnes" : "—"}</td>
      </tr>
    `)
    .join("");

  target.innerHTML = `
    <h3 style="margin:0 0 .5rem 0">Mantingal – TOP hráči</h3>
    <table id="mantingal">
      <thead>
        <tr>
          <th>#</th>
          <th>Hráč</th>
          <th>Stávka</th>
          <th>Posledný výsledok</th>
          <th>Streak</th>
          <th>Profit</th>
          <th>Aktívny dnes</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${mantBtnsHtml()}
  `;
}

function mantBtnsHtml() {
  // malé pomocné tlačidlá na manuálne testy
  return `
    <div style="margin-top:.8rem; display:flex; gap:.5rem; flex-wrap:wrap">
      <button id="mant-update-10">Vyhodnotiť (10:00)</button>
      <button id="mant-reset-12">Pridať dnešnú TOP10 (12:00)</button>
    </div>
  `;
}

async function bindMantingalButtons() {
  document.getElementById("mant-update-10")?.addEventListener("click", async () => {
    try {
      const r = await fetch("/api/mantingal?action=update", { method: "POST" });
      await r.json();
      const st = await fetchMantingalState();
      renderMantingal(st);
    } catch (e) { console.error(e); }
  });

  document.getElementById("mant-reset-12")?.addEventListener("click", async () => {
    try {
      const r = await fetch("/api/mantingal?action=reset", { method: "POST" });
      await r.json();
      const st = await fetchMantingalState();
      renderMantingal(st);
    } catch (e) { console.error(e); }
  });
}

// pri otvorení sekcie Mantingal – načítaj a zobraz
async function displayMantingal() {
  const st = await fetchMantingalState();
  renderMantingal(st);
  // udalosti sa musia naviazať až po renderi
  bindMantingalButtons();
}

// 🔁 zavolaj displayMantingal() pri načítaní stránky (nech sa sekcia pripraví)
window.addEventListener("DOMContentLoaded", () => {
  // fetchMatches() už voláš vyššie
  displayMantingal();
});

// === Štart ===
window.addEventListener("DOMContentLoaded", () => {
  fetchMatches();
  displayPredictions(); // 🔹 pridaj túto funkciu
});
