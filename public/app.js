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

// === Tipovacie stratégie ===
async function displayStrategies() {
  const wrap = document.getElementById("strategies-section");
  if (!wrap) return;

  // 🟢 Úvodný text ostane navždy hore
  wrap.innerHTML = `
    <h2>Tipovacie stratégie</h2>
    <p>💡 Model: 10 € na to, že v zápase niekto dá aspoň 2 góly (kurz 1.9)</p>
    <p>Načítavam výsledky...</p>
  `;

  try {
    const resp = await fetch("/api/strategies");
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Chyba načítania");

    const { totalBet, totalProfit, results } = data;

    // 🟢 Text o modeli nechávame a len pridávame ďalší obsah
    const summary = `
      <p><b>Počet zápasov:</b> ${results.length} |
      <b>Vsadené:</b> ${totalBet.toFixed(2)} € |
      <b>Výsledok:</b> ${totalProfit.toFixed(2)} €</p>
    `;

    const table = `
      <table class="strategies-table">
        <thead>
          <tr>
            <th>Dátum</th>
            <th>Zápas</th>
            <th>2+ góly</th>
            <th>Výsledok</th>
            <th>Zisk (€)</th>
          </tr>
        </thead>
        <tbody>
          ${results
            .map(
              (r) => `
            <tr class="${r.success ? "win-row" : ""}" data-id="${r.id}">
              <td>${r.date}</td>
              <td>${r.home} – ${r.away}</td>
              <td>${r.success ? "✅ Áno" : "❌ Nie"}</td>
              <td>${r.success ? "Výhra" : "Prehra"}</td>
              <td>${r.profit}</td>
            </tr>
            ${
              r.success && r.scorers?.length
                ? `
              <tr class="detail-row hidden" id="detail-${r.id}">
                <td colspan="5">
                  ${r.scorers
                    .map(
                      (p) => `
                    <div>
                      <b>${p.name}</b> (${p.team}) – ${p.goals}G ${p.assists}A | +/- ${p.plusMinus} | strely: ${p.shots}
                    </div>`
                    )
                    .join("")}
                </td>
              </tr>`
                : ""
            }
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    wrap.innerHTML = `
      <h2>Tipovacie stratégie</h2>
      <p>💡 Model: 10 € na to, že v zápase niekto dá aspoň 2 góly (kurz 1.9)</p>
      ${summary}
      ${table}
    `;

    // 🟢 Kliknutie na výherné zápasy pre rozbalenie detailov
    wrap.querySelectorAll(".win-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        const detail = document.getElementById(`detail-${id}`);
        if (detail) detail.classList.toggle("hidden");
      });
    });
  } catch (err) {
    wrap.innerHTML += `<p>❌ Chyba: ${err.message}</p>`;
  }
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

 // === Mantingal sekcia ===
async function displayMantingal() {
  const container = document.getElementById("mantingal-container");
  if (!container) return;
  container.innerHTML = "<h2>Mantingal stratégia</h2><p>Načítavam stav...</p>";

  try {
    const resp = await fetch("/api/mantingal?action=state");
    const data = await resp.json();

    if (!data.ok || !data.state?.players) {
      container.innerHTML = "<p>Žiadne dáta o hráčoch.</p>";
      return;
    }

    const players = data.state.players;
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr><th>Hráč</th><th>Stávka (€)</th><th>Zisk (€)</th><th>Streak</th><th>Posledný výsledok</th></tr>
      </thead>
      <tbody>
        ${Object.entries(players)
          .map(([name, p]) => `
            <tr>
              <td>${name}</td>
              <td>${p.stake?.toFixed?.(2) ?? p.stake}</td>
              <td>${p.profit?.toFixed?.(2) ?? p.profit}</td>
              <td>${p.streak ?? 0}</td>
              <td>${p.lastResult ?? "-"}</td>
            </tr>
          `)
          .join("")}
      </tbody>
    `;
    container.innerHTML = "<h2>Mantingal stratégia</h2>";
    container.appendChild(table);
  } catch (e) {
    container.innerHTML = `<p>Chyba pri načítaní Mantingal: ${e.message}</p>`;
  }
}

// === Štart ===
window.addEventListener("DOMContentLoaded", () => {
  fetchMatches();
  displayPredictions(); // 🔹 pridaj túto funkciu
  displayStrategies(); 
});
