// public/app.js
// public/app.js

let teamRatings = {};
let playerRatings = {};
let allMatches = [];
let playerTeams = {}; // mapovanie priezvisko → tím
let fullTeamNames = {};

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
    dateRow.innerHTML = `<td colspan="4" class="date-header">${formatted}</td>`;
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

async function displayTeamRatings() {
  const tableBody = document.querySelector("#teamRatings tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  // 1️⃣ Načítaj databázu hráčov, aby sme dostali celé názvy tímov
  let fullTeamNames = {};
  try {
    const resp = await fetch("/data/nhl_players.json", { cache: "no-store" });
    const players = await resp.json();
    players.forEach((p) => {
      if (p.team) {
        const teamName = p.team.trim();
        const short = teamName.split(" ").pop();
        if (!fullTeamNames[short]) fullTeamNames[short] = teamName;
      }
    });
  } catch (err) {
    console.warn("⚠️ Nepodarilo sa načítať nhl_players.json:", err);
  }

  // 2️⃣ Oficiálne skratky tímov podľa NHL API (rovnaké ako v predikciách)
  // 2️⃣ Oficiálne skratky tímov podľa NHL API (rovnaké ako v predikciách)
  const teamCodes = {
    "Anaheim Ducks": "ANA",
    "Arizona Coyotes": "ARI",
    "Boston Bruins": "BOS",
    "Buffalo Sabres": "BUF",
    "Calgary Flames": "CGY",
    "Carolina Hurricanes": "CAR",
    "Chicago Blackhawks": "CHI",
    "Colorado Avalanche": "COL",
    "Blue Jackets": "CBJ",
    "Dallas Stars": "DAL",
    "Red Wings": "DET",
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
    "St.Louis Blues": "STL",
    "Tampa Bay Lightning": "TBL",
    "Maple Leafs": "TOR",
    "Vancouver Canucks": "VAN",
    "Golden Knights": "VGK",
    "Washington Capitals": "WSH",
    "Winnipeg Jets": "WPG",
    "Utah Mammoth": "UTA"
  };

  const getTeamLogo = (teamName) => {
    const code = teamCodes[teamName] || "";
    if (!code) return "/icons/nhl_placeholder.svg";
    return `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg`;
  };

  // 3️⃣ Zoradenie tímov podľa ratingu (zostupne)
  const sorted = Object.entries(teamRatings).sort((a, b) => b[1] - a[1]);

  // 4️⃣ Render tabuľky
  sorted.forEach(([team, rating]) => {
    const fullName = fullTeamNames[team] || team;
    const logoUrl = getTeamLogo(fullName);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="display:flex; align-items:center; gap:10px; min-width:200px;">
        <img src="${logoUrl}" alt="${fullName}" title="${fullName}"
             onerror="this.src='/icons/nhl_placeholder.svg'"
             style="width:26px; height:26px; object-fit:contain; transition:transform 0.2s ease;">
        <span>${fullName}</span>
      </td>
      <td style="text-align:center; font-weight:600;">${rating}</td>
    `;
    tableBody.appendChild(row);
  });

  // 💫 Hover efekt pre logá
  document.querySelectorAll("#teamRatings img").forEach(img => {
    img.addEventListener("mouseenter", () => img.style.transform = "scale(1.15)");
    img.addEventListener("mouseleave", () => img.style.transform = "scale(1)");
  });
}

// Načítaj lokálnu databázu hráčov
async function loadPlayerTeams() {
  try {
    const resp = await fetch("/data/nhl_players.json");
    const players = await resp.json();

    playerTeams = players.reduce((acc, p) => {
      const last = String(p.lastName || "").trim().toLowerCase();
      if (last) acc[last] = p.team || "";
      return acc;
    }, {});

    console.log("✅ Načítané tímy pre hráčov:", Object.keys(playerTeams).length);
  } catch (err) {
    console.warn("⚠️ Nepodarilo sa načítať /data/nhl_players.json:", err.message);
  }
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
    // 🔹 zisti priezvisko (posledné slovo v mene)
    const parts = player.split(" ");
    const lastName = parts[parts.length - 1].replace(/\./g, "").toLowerCase();

    // 🔹 z databázy (globálna premená playerTeams)
    const team = playerTeams && playerTeams[lastName] ? playerTeams[lastName] : "";

    // 🔹 vytvor riadok tabuľky
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        ${index + 1}. ${player}
        ${team ? `<span style="color:#999; font-size:0.9em;"> (${team})</span>` : ""}
      </td>
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
      <h2>Martingale stratégia</h2>
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

// === História stávok Mantingalu (vložená pod Mantingal tabuľku) ===
async function displayMantingalHistory() {
  const mainContainer = document.getElementById("mantingal-container");
  if (!mainContainer) return;

  // vytvor nový blok pre históriu
  const historyDiv = document.createElement("div");
  historyDiv.id = "mantingal-history";
  historyDiv.innerHTML = "<h3>História stávok Mantingalu</h3><p>Načítavam dáta...</p>";
  mainContainer.appendChild(historyDiv);

  try {
    const resp = await fetch("/api/mantingal?action=history&limit=50");
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.bets)) {
      historyDiv.innerHTML = "<p>❌ Nepodarilo sa načítať históriu stávok.</p>";
      return;
    }

    const bets = data.bets;
    if (!bets.length) {
      historyDiv.innerHTML = "<h3>História stávok Mantingalu</h3><p>Zatiaľ žiadne dáta.</p>";
      return;
    }

    // vytvor tabuľku
    let html = `
      <h3>História stávok Mantingalu</h3>
      <table>
        <thead>
          <tr>
            <th>Dátum</th>
            <th>Hráč</th>
            <th>Výsledok</th>
            <th>Stávka (€)</th>
            <th>Profit po (€)</th>
          </tr>
        </thead>
        <tbody>
    `;

    bets.forEach(b => {
      const resultIcon =
        b.result === "win"
          ? "✅"
          : b.result === "loss"
          ? "❌"
          : b.result === "skip"
          ? "⏸️"
          : "-";

      html += `
        <tr class="${b.result}">
          <td>${new Date(b.ts).toLocaleString("sk-SK")}</td>
          <td>${b.name}</td>
          <td>${resultIcon}</td>
          <td>${b.stake.toFixed(2)}</td>
          <td style="color:${b.profitAfter >= 0 ? "limegreen" : "red"}">${b.profitAfter.toFixed(2)}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    historyDiv.innerHTML = html;
  } catch (err) {
    historyDiv.innerHTML = `<p>❌ Chyba: ${err.message}</p>`;
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
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.players)) {
      throw new Error(data.error || "Nepodarilo sa načítať databázu hráčov");
    }

    wrap.innerHTML = `
      <h2>Databáza hráčov NHL</h2>
      <p>Počet hráčov v databáze: <b>${data.count}</b></p>
      <p>Zobrazených prvých 300 hráčov:</p>
    `;

    const table = document.createElement("table");
    table.className = "players-table";

    const getFlag = (code) => {
  if (!code) return "";

  const map = {
    CAN: "ca",
    USA: "us",
    RUS: "ru",
    SWE: "se",
    FIN: "fi",
    DNK: "dk",
    CZE: "cz",
    SVK: "sk",
    GER: "de",
    SUI: "ch",
    NOR: "no",
    AUT: "at",
    LVA: "lv",
    EST: "ee",
    FRA: "fr",
    GBR: "gb",
    AUS: "au",
  };

  const c = String(code).trim().toUpperCase();
  const iso2 = map[c] || c.slice(0, 2).toLowerCase();

  return `
    <img 
      src="https://flagcdn.com/24x18/${iso2}.png" 
      alt="${c}" 
      title="${c}" 
      class="flag" 
      onerror="this.style.display='none'">
  `;
};

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
          .slice(0, 300)
          .map(
            (p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name}</td>
              <td>${p.team}</td>
              <td>${getFlag(p.country)} ${p.country}</td>
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

// === Najlepšia strelecká úspešnosť NHL ===
async function displayShootingLeaders() {
  const container = document.getElementById("shooting-section");
 
  try {
    const resp = await fetch("/api/statistics");
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.top) || data.top.length === 0) {
      container.innerHTML = "<p>❌ Dáta sa nepodarilo načítať.</p>";
      return;
    }

    const players = data.top.slice(0, 50);

    let html = `
      <h2>Najlepšia strelecká úspešnosť NHL</h2>
      <table class="shooting-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hráč</th>
            <th>Tím</th>
            <th>Góly</th>
            <th>Strely</th>
            <th>Úspešnosť</th>
            <th>Zápasy</th>
          </tr>
        </thead>
        <tbody>
    `;

    players.forEach((p, i) => {
      html += `
        <tr>
          <td>${i + 1}</td>
          <td>
            <img src="${p.headshot}" alt="${p.name}" class="player-headshot">
            ${p.name}
          </td>
          <td>${p.team}</td>
          <td>${p.goals}</td>
          <td>${p.shots}</td>
          <td>${p.shootingPctg.toFixed(1)}%</td>
          <td>${p.gamesPlayed}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = `<div class="shooting-table-wrapper">${html}</div>`;
  } catch (err) {
    container.innerHTML = `<p>❌ Chyba: ${err.message}</p>`;
  }
}// === Prepínanie sekcií a načítanie dát dynamicky ===
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", async () => {
    const targetId = btn.getAttribute("onclick")?.match(/'(.*?)'/)?.[1];
    if (!targetId) return;

    // 🔹 Skry všetky sekcie
    document.querySelectorAll(".section, .content-section").forEach(sec => sec.style.display = "none");

    // 🔹 Zobraz len tú vybranú
    const section = document.getElementById(targetId);
    if (section) section.style.display = "block";

    // 🔹 Spusti len dané dáta podľa sekcie
    switch (targetId) {
      case "matches-section":
        await fetchMatches();
        break;
      case "teams-section":
        await displayTeamRatings();
        break;
      case "players-section":
        await displayPlayerRatings();
        break;
      case "mantingal-container":
        await displayMantingal();
        await displayMantingalHistory();
        break;
      case "predictions-section":
        await displayPredictions();
        break;
      case "shooting-section":
        await displayShootingLeaders();
        break;
      case "strategies-section":
        await displayStrategies();
        break;
      default:
        break;
    }
  });
});

// === Mobile select menu ===
document.getElementById("mobileSelect")?.addEventListener("change", async (e) => {
  const val = e.target.value;

  // 🔹 Skry všetko
  document.querySelectorAll(".section, .content-section").forEach(sec => sec.style.display = "none");

  let targetId = "";
  switch (val) {
    case "matches": targetId = "matches-section"; break;
    case "teams": targetId = "teams-section"; break;
    case "players": targetId = "players-section"; break;
    case "mantingal": targetId = "mantingal-container"; break;
    case "predictions": targetId = "predictions-section"; break;
    case "shooting": targetId = "shooting-section"; break;
    case "strategies": targetId = "strategies-section"; break;
  }

  const section = document.getElementById(targetId);
  if (section) section.style.display = "block";

  // 🔹 Dynamické načítanie obsahu podľa výberu
  switch (targetId) {
    case "matches-section":
      await fetchMatches();
      break;
    case "teams-section":
      await displayTeamRatings();
      break;
    case "players-section":
      await displayPlayerRatings();
      break;
    case "mantingal-container":
      await displayMantingal();
      await displayMantingalHistory();
      break;
    case "predictions-section":
      await displayPredictions();
      break;
    case "shooting-section":
      await displayShootingLeaders();
      break;
    case "strategies-section":
      await displayStrategies();
      break;
    default:
      break;
  }
});

// === Štart stránky ===
window.addEventListener("DOMContentLoaded", async () => {
  await loadPlayerTeams();
  await fetchMatches();
});
