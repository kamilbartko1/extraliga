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
    const resp = await fetch("/api/predictions", { cache: "no-store" });
    const data = await resp.json();

    if (!data.games?.length) {
      container.innerHTML = "<p>Žiadne dostupné kurzy</p>";
      return;
    }

    const list = document.createElement("div");
    list.className = "odds-blocks";

    data.games.forEach(game => {
      const home = game.homeTeam?.name?.default || "-";
      const away = game.awayTeam?.name?.default || "-";
      const homeLogo = game.homeTeam?.logo || "";
      const awayLogo = game.awayTeam?.logo || "";

      // --- Získaj kurzy 1X2 ---
      const homeOdds3 = game.homeTeam?.odds?.find(o => o.description === "MONEY_LINE_3_WAY" && !o.qualifier)?.value;
      const drawOdds3 = game.homeTeam?.odds?.find(o => o.qualifier === "Draw")?.value;
      const awayOdds3 = game.awayTeam?.odds?.find(o => o.description === "MONEY_LINE_3_WAY" && !o.qualifier)?.value;

      const homeOdds = homeOdds3 ?? game.homeTeam?.odds?.find(o => o.description === "MONEY_LINE_2_WAY")?.value ?? "-";
      const drawOdds = drawOdds3 ?? "-";
      const awayOdds = awayOdds3 ?? game.awayTeam?.odds?.find(o => o.description === "MONEY_LINE_2_WAY")?.value ?? "-";
      const hasDraw = drawOdds !== "-";

      // --- Získaj kurzy OVER/UNDER ---
      const over = game.homeTeam?.odds?.find(o => o.description === "OVER_UNDER" && o.qualifier.startsWith("O"));
      const under = game.awayTeam?.odds?.find(o => o.description === "OVER_UNDER" && o.qualifier.startsWith("U"));

      const overText = over ? `${over.qualifier.replace("O", "Viac ako ")} (${over.value})` : null;
      const underText = under ? `${under.qualifier.replace("U", "Menej ako ")} (${under.value})` : null;

      // --- HTML blok ---
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
          <div class="odds-cell"><b>1</b><br>${homeOdds !== undefined ? homeOdds : "-"}</div>
          ${hasDraw ? `<div class="odds-cell"><b>X</b><br>${drawOdds}</div>` : ""}
          <div class="odds-cell"><b>2</b><br>${awayOdds !== undefined ? awayOdds : "-"}</div>
        </div>

        ${overText && underText ? `
          <div class="ou-row">
            <div class="ou-cell"><b>${overText}</b></div>
            <div class="ou-cell"><b>${underText}</b></div>
          </div>
        ` : ""}
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

// === Štart ===
window.addEventListener("DOMContentLoaded", () => {
  fetchMatches();
  displayPredictions(); // 🔹 pridaj túto funkciu
});
