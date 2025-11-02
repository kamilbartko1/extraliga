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
async function fetchMatches() {
  const statusEl = document.getElementById("load-status");
  if (statusEl) statusEl.textContent = "⏳ Načítavam zápasy a ratingy...";

  try {
    const response = await fetch(`${API_BASE}/api/matches`);

    if (!response.ok) {
      const txt = await response.text();
      console.error("❌ Server vrátil chybu:", txt);
      if (statusEl) statusEl.textContent = "❌ Server vrátil chybu pri načítaní dát.";
      return;
    }

    const data = await response.json();
    console.log("✅ Dáta z backendu:", data);

    const totalGames = Array.isArray(data.matches) ? data.matches.length : 0;
    const totalPlayers = data.playerRatings ? Object.keys(data.playerRatings).length : 0;
    if (statusEl)
      statusEl.textContent = `✅ Dokončené: ${totalGames} zápasov | ${totalPlayers} hráčov v rebríčku`;

    allMatches = Array.isArray(data.matches) ? data.matches : [];

    if (!allMatches.length) {
      console.warn("⚠️ Žiadne zápasy v data.matches");
      if (statusEl) statusEl.textContent = "⚠️ Žiadne odohrané zápasy";
    }

    displayMatches(allMatches);
    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};
    displayTeamRatings();
    displayPlayerRatings();
    displayMantingal();

  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
    if (statusEl)
      statusEl.textContent = "❌ Chyba pri načítaní dát. Skús obnoviť stránku.";
  }
}

// === Zápasy ===
function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (!matches || matches.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  // Zoskup zápasy podľa dátumu
  const grouped = {};
  matches.forEach(m => {
    const date = m.date || new Date(m.sport_event?.start_time || "").toISOString().slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(m);
  });

  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  days.forEach(day => {
    const dateRow = document.createElement("tr");
    const formatted = new Date(day).toLocaleDateString("sk-SK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    dateRow.innerHTML = `<td colspan="4"><b>${formatted}</b></td>`;
    tableBody.appendChild(dateRow);

    grouped[day].forEach(match => {
      const home = match.home_team || match.sport_event?.competitors?.[0]?.name || "Home";
      const away = match.away_team || match.sport_event?.competitors?.[1]?.name || "Away";
      const hs = match.home_score ?? match.sport_event_status?.home_score ?? "-";
      const as = match.away_score ?? match.sport_event_status?.away_score ?? "-";
      const status = (match.status || match.sport_event_status?.status || "").toLowerCase();

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${home}</td>
        <td>${away}</td>
        <td>${hs} : ${as}</td>
        <td>${status === "closed" ? "✅" : status === "ap" ? "🟡" : "..."}</td>
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

// === Mantingal sekcia (nová verzia) ===
async function displayMantingal() {
  const container = document.getElementById("mantingal-container");
  if (!container) return;

  container.innerHTML = "<h2>Mantingal stratégia</h2><p>Načítavam dáta...</p>";

  try {
    const resp = await fetch("/api/mantingal", { cache: "no-store" });
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.players)) {
      container.innerHTML = "<p>❌ Nepodarilo sa načítať dáta Mantingal.</p>";
      return;
    }

    const { players, dateChecked, totalGames, scorers } = data;
    // 🔹 Spočítaj sumár Mantingal dňa
    const totalBets = players.length; // každý hráč = 1 stávka
    const totalProfit = players.reduce((sum, p) => sum + p.profit, 0);
    const roi = ((totalProfit / (totalBets * 1)) * 100).toFixed(1); // ak je base stake 1€

    // Info o spracovaní
    let html = `
      <h2>Mantingal stratégia</h2>
      <p><b>Dátum:</b> ${dateChecked}</p>
      <p><b>Počet zápasov:</b> ${totalGames}</p>
      <p><b>Počet strelcov:</b> ${scorers}</p>
      <p><b>Počet stávok:</b> ${totalBets}</p>
      <p><b>Celkový zisk:</b> <span style="color:${totalProfit >= 0 ? "limegreen" : "red"}">
        ${totalProfit.toFixed(2)} €
      </span></p>
      <p><b>ROI:</b> <span style="color:${roi >= 0 ? "limegreen" : "red"}">${roi}%</span></p>
      <table>
        <thead>
          <tr>
            <th>Hráč</th>
            <th>Stávka (€)</th>
            <th>Zisk (€)</th>
            <th>Streak</th>
            <th>Výsledok</th>
          </tr>
        </thead>
        <tbody>
    `;

    players.forEach((p) => {
      html += `
        <tr>
          <td>${p.name}</td>
          <td>${p.stake.toFixed(2)}</td>
          <td style="color:${p.profit >= 0 ? "limegreen" : "red"}">${p.profit.toFixed(2)}</td>
          <td>${p.streak}</td>
          <td>
  ${
    p.lastResult === "win"
      ? "✅"
      : p.lastResult === "loss"
      ? "❌"
      : p.lastResult === "skip"
      ? "⏸️"
      : "-"
  }
</td>

        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p>❌ Chyba: ${err.message}</p>`;
  }
}

// === Tipovacie stratégie (zobrazenie databázy hráčov) ===
async function displayStrategies() {
  const wrap = document.getElementById("strategies-section");
  if (!wrap) return;

  wrap.innerHTML = `
    <h2>Databáza hráčov NHL</h2>
    <p>Načítavam údaje z lokálnej databázy...</p>
  `;

  try {
    const resp = await fetch("/api/strategies", { cache: "no-store" });

    let data;
    try {
      data = await resp.json();
    } catch {
      const txt = await resp.text();
      throw new Error("Očakával som JSON, prišlo: " + txt.slice(0, 120));
    }

    if (!data.ok || !Array.isArray(data.players)) {
      throw new Error(data.error || "Nepodarilo sa načítať databázu hráčov");
    }

    // === Zobrazenie sumára ===
    wrap.innerHTML = `
      <h2>Databáza hráčov NHL</h2>
      <p>Počet hráčov v databáze: <b>${data.count}</b></p>
      <p>Zobrazených prvých 100 hráčov:</p>
    `;

    // === Vytvorenie tabuľky ===
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Meno</th>
          <th>Tím</th>
          <th>Krajina</th>
        </tr>
      </thead>
      <tbody>
        ${data.players
          .slice(0, 100) // obmedzíme výpis na prvých 100 hráčov
          .map(
            (p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name}</td>
              <td>${p.team}</td>
              <td>${p.country}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    `;

    wrap.appendChild(table);
  } catch (err) {
    wrap.innerHTML = `
      <h2>Databáza hráčov NHL</h2>
      <p style="color:red;">❌ Chyba: ${err.message}</p>
    `;
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

// === Štart ===
window.addEventListener("DOMContentLoaded", () => {
  // ✅ Hlavné časti načítame hneď
  fetchMatches();
  displayPredictions();
  displayMantingal();

  // 🧠 Po kliknutí na „Tipovacie stratégie“ načítaj databázu hráčov
  const strategyBtn = document.querySelector("button[onclick*='strategies-section']");
  const strategySection = document.getElementById("strategies-section");

  if (strategyBtn && strategySection) {
    strategyBtn.addEventListener("click", () => {
      console.log("🧠 Klikol si na sekciu Tipovacie stratégie – načítavam hráčov...");
      // zobraz sekciu (ak je skrytá)
      strategySection.style.display = "block";
      // načítaj dáta hráčov z /api/strategies
      displayStrategies();
    });
  }

  // 📊 Po kliknutí na „Predikcie“ znova načítaj kurzy
  const predBtn = document.querySelector("button[onclick*='predictions-section']");
  if (predBtn) predBtn.addEventListener("click", displayPredictions);

  // 🧩 Ak používateľ prišiel priamo s hashom #strategies, načítaj hneď
  if (window.location.hash.includes("strategies")) {
    displayStrategies();
  }
});


