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

// === Prednačítanie výsledkov a ratingov (spustí sa hneď po otvorení stránky) ===
async function preloadMatchesData() {
  try {
    console.log("🔹 Prednačítavam výsledky a ratingy...");
    const resp = await fetch("/api/matches", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    console.log(`✅ Prednačítané ${data.allMatches?.length || 0} zápasov.`);
  } catch (err) {
    console.warn("⚠️ Prednačítanie /api/matches zlyhalo:", err.message);
  }
}

// === DOMOVSKÁ STRÁNKA (moderný 3-panelový layout) ===
async function displayHome() {
  const home = document.getElementById("home-section");
  if (!home) return;

  home.innerHTML = `
    <p style="text-align:center;color:#00eaff;">⏳ Načítavam domovskú stránku...</p>
  `;

  try {
    // 1️⃣ Načítaj rýchle dáta (zápasy + mini štatistiky)
    const [homeResp, statsResp] = await Promise.all([
      fetch("/api/home", { cache: "no-store" }),
      fetch("/api/statistics", { cache: "no-store" })
    ]);

    if (!homeResp.ok) throw new Error(`HTTP ${homeResp.status}`);

    const homeData = await homeResp.json();
    const statsData = statsResp.ok ? await statsResp.json() : {};

    const topGoal = statsData?.topGoals?.[0] || {};
    const topPoints = statsData?.topPoints?.[0] || {};
    const topShots = statsData?.topShots?.[0] || {};

    // AI strelec – DOMA ZATIAĽ PLACEHOLDER
    let html = `
      <div class="home-container">
        
        <!-- 🏒 Dnešné zápasy -->
        <div class="home-panel matches-panel" onclick="showSection('matches-section')">
          <h3>🏒 Dnešné zápasy NHL</h3>
          ${
            homeData.matchesToday.length === 0
              ? `<p style="color:#aaa;">Žiadne zápasy dnes</p>`
              : homeData.matchesToday
                  .map(
                    (m) => `
              <div class="match-row">
                <img src="${m.homeLogo}" alt="${m.homeName}" class="team-logo">
                <span>${m.homeName}</span>
                <span style="color:#00eaff;">vs</span>
                <span>${m.awayName}</span>
                <img src="${m.awayLogo}" alt="${m.awayName}" class="team-logo">
                <div class="time">🕒 ${m.startTime}</div>
              </div>
            `
                  )
                  .join("")
          }
        </div>

        <!-- 🎯 AI STRELEC DŇA -->
        <div class="home-panel ai-panel" onclick="showSection('stats-section')">
          <h3>🎯 AI Strelci Dňa</h3>
          <div class="ai-scorer-box">
            <p style="color:#aaa;">Prebieha AI výpočet...</p>
          </div>
        </div>

        <!-- 📊 TOP ŠTATISTIKY -->
        <div class="home-panel stats-panel" onclick="showSection('stats-section')">
          <h3>📊 Top štatistiky hráčov</h3>
          
          <div class="top-player">
            <img src="${topGoal.headshot || "/icons/nhl_placeholder.svg"}" alt="${topGoal.name}">
            <div><b>${topGoal.name || "-"}</b><br>🥅 ${topGoal.goals || 0} gólov</div>
            <span class="stat-label">Top Góly</span>
          </div>

          <div class="top-player">
            <img src="${topPoints.headshot || "/icons/nhl_placeholder.svg"}" alt="${topPoints.name}">
            <div><b>${topPoints.name || "-"}</b><br>⚡ ${topPoints.points || 0} bodov</div>
            <span class="stat-label">Top Body</span>
          </div>

          <div class="top-player">
            <img src="${topShots.headshot || "/icons/nhl_placeholder.svg"}" alt="${topShots.name}">
            <div><b>${topShots.name || "-"}</b><br>🎯 ${topShots.shots || 0} striel</div>
            <span class="stat-label">Top Strely</span>
          </div>
        </div>
      </div>

      <footer class="home-footer">© 2025 NHLPRO.sk | AI hokejové predikcie</footer>
    `;

    home.innerHTML = html;

    // 3️⃣ NEBLOKUJÚCI AI strelec – volá náš nový endpoint
    setTimeout(async () => {
      try {
        const resp = await fetch("/api/ai?task=scorer", { cache: "no-store" });
        if (!resp.ok) return;

        const data = await resp.json();
        const ai = data?.aiScorerTip;

        const box = document.querySelector("#home-section .ai-scorer-box");
        if (!box) return;

        if (!ai) {
          box.innerHTML = `<p style="color:#aaa;">AI strelca sa zatiaľ nepodarilo vypočítať.</p>`;
          return;
        }

        box.innerHTML = `
          <img src="${ai.headshot || "/icons/nhl_placeholder.svg"}" class="player-headshot">
          <div class="ai-scorer-info">
            <p><b>${ai.player}</b> (${ai.team})</p>
            <p style="color:#00eaff;">${ai.match}</p>
            <p>🥅 Góly: <b>${ai.goals}</b> | 🎯 Strely: <b>${ai.shots}</b> | ⚡ PP: <b>${ai.powerPlayGoals}</b></p>
            <p>🧠 Pravdepodobnosť gólu: <b style="color:#ffcc00;">${ai.probability}%</b></p>
          </div>
        `;
      } catch (err) {
        console.warn("⚠️ AI scorer failed:", err.message);
      }
    }, 300); // rýchly refresh po 0.3 sekundy

  } catch (err) {
    console.error("❌ Chyba domov:", err);
    home.innerHTML = `<p style="color:red;text-align:center;">❌ Chyba: ${err.message}</p>`;
  }
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
    displayPlayerRatings();
    displayMantingal();

  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
    if (statusEl)
      statusEl.textContent = "❌ Chyba pri načítaní dát. Skús obnoviť stránku.";
  }
}

// === Zápasy ===
async function displayMatches(matches) {
  const tableBody = document.querySelector("#matches tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (!matches || matches.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4">Žiadne odohrané zápasy</td></tr>`;
    return;
  }

  // Zoskupenie podľa dátumu
  const grouped = {};
  for (const m of matches) {
    const date =
      m.date ||
      new Date(m.sport_event?.start_time || "").toISOString().slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(m);
  }

  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  // 🧱 Krok 1: Vytvor HTML tabuľku bez fetchu
  let html = "";
  for (const day of days) {
    const formatted = new Date(day).toLocaleDateString("sk-SK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    html += `<tr><td colspan="4" class="date-header">${formatted}</td></tr>`;

    for (const match of grouped[day]) {
      const home =
        match.home_team ||
        match.sport_event?.competitors?.[0]?.name ||
        "Home";
      const away =
        match.away_team ||
        match.sport_event?.competitors?.[1]?.name ||
        "Away";
      const hs =
        match.home_score ?? match.sport_event_status?.home_score ?? "-";
      const as =
        match.away_score ?? match.sport_event_status?.away_score ?? "-";
      const status = (match.status || match.sport_event_status?.status || "")
        .toLowerCase();
      const recapId = `recap-${match.id}`;

     // 🔹 Získaj označenie zápasu (OT → pp, SO → sn)
      let suffix = "";
      if (match.outcome) {
      if (match.outcome === "OT") suffix = " pp";
      else if (match.outcome === "SO") suffix = " sn";
    }

      html += `
        <tr>
          <td>${home}</td>
          <td>${away}</td>
          <td class="score-cell">
           ${hs} : ${as}${suffix.toLowerCase()}
          </td>
          <td id="${recapId}" class="highlight-cell" style="text-align:center;color:#999;">
            ${status === "closed" ? "⏳" : "—"}
          </td>
        </tr>`;
    }
  }

  tableBody.innerHTML = html;

  // 🎥 Krok 2: Postupne doplň zostrihy (sekvenčne = žiadne duplikáty)
  for (const day of days) {
    for (const match of grouped[day]) {
      const status = (match.status || "").toLowerCase();
      if (status !== "closed") continue;

      const home =
        match.home_team ||
        match.sport_event?.competitors?.[0]?.name ||
        "Home";

      try {
        const resp = await fetch(
          `/api/highlights?team=${encodeURIComponent(home)}&id=${match.id}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        const cell = document.getElementById(`recap-${match.id}`);
        if (!cell) continue;

        if (data.ok && data.highlight) {
          cell.innerHTML = `<a href="${data.highlight}" target="_blank" class="highlight-link">🎥 Zostrih</a>`;
        } else {
          cell.innerHTML = `<span style="color:#777;">—</span>`;
        }
      } catch (err) {
        console.warn("⚠️ Chyba zostrihu:", err);
        const cell = document.getElementById(`recap-${match.id}`);
        if (cell) cell.innerHTML = `<span style="color:red;">❌</span>`;
      }
    }
  }
}

// === RATING TÍMOV ===
async function displayTeamRatings() {
  const tableBody = document.querySelector("#teamRatings tbody");
  if (!tableBody) return;

  // 🧹 najskôr vyčisti tabuľku
  tableBody.innerHTML = "";

  // 🔹 odstráň duplicity
  const uniqueRatings = {};
  for (const [team, rating] of Object.entries(teamRatings)) {
    uniqueRatings[team] = rating;
  }

  // načítaj celé názvy (ak existuje databáza)
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

  // mapy triCode
  const nickToCode = {
    "Ducks": "ANA", "Coyotes": "ARI", "Bruins": "BOS", "Sabres": "BUF", "Flames": "CGY",
    "Hurricanes": "CAR", "Blackhawks": "CHI", "Avalanche": "COL", "Blue Jackets": "CBJ",
    "Stars": "DAL", "Red Wings": "DET", "Oilers": "EDM", "Panthers": "FLA", "Kings": "LAK",
    "Wild": "MIN", "Canadiens": "MTL", "Predators": "NSH", "Devils": "NJD", "Islanders": "NYI",
    "Rangers": "NYR", "Senators": "OTT", "Flyers": "PHI", "Penguins": "PIT", "Sharks": "SJS",
    "Kraken": "SEA", "Blues": "STL", "Lightning": "TBL", "Maple Leafs": "TOR", "Canucks": "VAN",
    "Golden Knights": "VGK", "Capitals": "WSH", "Jets": "WPG", "Mammoth": "UTA", "Mammoths": "UTA"
  };

  function resolveTeamCode(fullName) {
    if (!fullName) return "";
    const norm = fullName.replace(/\./g, "").replace(/\s+/g, " ").trim();
    for (const [nick, code] of Object.entries(nickToCode)) {
      if (norm.toLowerCase().includes(nick.toLowerCase())) return code;
    }
    return "";
  }

  // zoradenie bez duplikátov
  const sorted = Object.entries(uniqueRatings).sort((a, b) => b[1] - a[1]);

  // render
  sorted.forEach(([team, rating]) => {
    const fullName = fullTeamNames[team] || team;
    const code = resolveTeamCode(fullName);
    const logoUrl = code
      ? `https://assets.nhle.com/logos/nhl/svg/${code}_light.svg`
      : "/icons/nhl_placeholder.svg";

    const row = document.createElement("tr");
    row.className = "team-row";
    row.dataset.code = code;

    row.innerHTML = `
      <td style="display:flex; align-items:center; gap:10px; min-width:220px;">
        <img src="${logoUrl}" alt="${fullName}" title="${fullName}"
             onerror="this.src='/icons/nhl_placeholder.svg'"
             style="width:26px; height:26px; object-fit:contain;">
        <span>${fullName}</span>
      </td>
      <td style="text-align:center; font-weight:400;">${rating}</td>
    `;

   row.setAttribute("data-logo", team.logo);

    tableBody.appendChild(row);
  });

  // hover efekt
  document.querySelectorAll("#teamRatings img").forEach((img) => {
    img.addEventListener("mouseenter", () => (img.style.transform = "scale(1.15)"));
    img.addEventListener("mouseleave", () => (img.style.transform = "scale(1)"));
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

// === NOVÁ SEKCIA: Štatistiky hráčov NHL (mini boxy) ===
async function displayShootingLeaders() {
  const grid = document.getElementById("stats-grid");
  const detail = document.getElementById("stats-detail");
  if (!grid || !detail) return;

  let lastStats = null;
  let lastFetchTime = 0;

  // 💎 Vykreslenie tabuľky v modernom kompaktnom mobile-friendly režime
  function renderStats(data, type) {
    detail.innerHTML = `<p style="text-align:center;color:#00eaff;">📊 Načítavam štatistiky...</p>`;

    let players = [];
    let title = "";
    let columns = "";

    const TYPES = {
      accuracy: { list: "topAccuracy", title: "🎯 Najlepšia strelecká úspešnosť", cols: "<th>Góly</th><th>Strely</th><th>%</th>" },
      shots: { list: "topShots", title: "🔥 Najviac striel", cols: "<th>Strely</th>" },
      goals: { list: "topGoals", title: "🥅 Najviac gólov", cols: "<th>Góly</th>" },
      assists: { list: "topAssists", title: "🎩 Najviac asistencií", cols: "<th>A</th>" },
      points: { list: "topPoints", title: "⚡ Najviac bodov", cols: "<th>Body</th>" },
      plusminus: { list: "topPlusMinus", title: "➕➖ Najlepšie +/-", cols: "<th>+/-</th>" },
      pim: { list: "topPIM", title: "⛓️ Najviac trestov", cols: "<th>PIM</th>" },
      toi: { list: "topTOI", title: "🕒 Najviac TOI (min)", cols: "<th>Min</th>" },
      powerPlayGoals: { list: "topPowerPlayGoals", title: "🥈 Najviac PP gólov", cols: "<th>PP</th>" }
    };

    const sel = TYPES[type];
    if (!sel) {
      detail.innerHTML = `<p style="text-align:center;color:#aaa;">⚠️ Štatistika nie je dostupná.</p>`;
      return;
    }

    players = data[sel.list] || [];
    title = sel.title;
    columns = sel.cols;

    if (!players.length) {
      detail.innerHTML = `<p style="text-align:center;color:#aaa;">⚠️ Žiadne dáta.</p>`;
      return;
    }

    // 💎 Kompaktná tabuľka – žiadny min-width, všetko sa zmestí
    let html = `
      <h3 style="text-align:center;color:#00eaff;margin-bottom:10px;">${title}</h3>
      <table class="shooting-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hráč</th>
            <th>Tím</th>
            ${columns}
          </tr>
        </thead>
        <tbody>
    `;

    players.slice(0, 50).forEach((p, i) => {
      const img = `
        <img src="${p.headshot}" alt="${p.name}" 
          style="width:20px;height:20px;border-radius:50%;margin-right:4px;vertical-align:middle;">
      `;

      let statCell = "";
      switch (type) {
        case "accuracy":
          statCell = `<td>${p.goals}</td><td>${p.shots}</td><td>${p.shootingPctg.toFixed(1)}%</td>`;
          break;
        case "shots":
          statCell = `<td>${p.shots}</td>`;
          break;
        case "goals":
          statCell = `<td>${p.goals}</td>`;
          break;
        case "assists":
          statCell = `<td>${p.assists}</td>`;
          break;
        case "points":
          statCell = `<td>${p.points}</td>`;
          break;
        case "plusminus":
          statCell = `<td>${p.plusMinus}</td>`;
          break;
        case "pim":
          statCell = `<td>${p.pim}</td>`;
          break;
        case "toi":
          statCell = `<td>${p.toi}</td>`;
          break;
        case "powerPlayGoals":
          statCell = `<td>${p.powerPlayGoals}</td>`;
          break;
      }

      html += `
        <tr>
          <td>${i + 1}</td>
          <td>${img}${p.name}</td>
          <td>${p.team}</td>
          ${statCell}
        </tr>
      `;
    });

    html += "</tbody></table>";
    detail.innerHTML = html;
  }

  // 📌 Listener
  grid.querySelectorAll(".stat-box").forEach((box) => {
    box.addEventListener("click", async () => {
      const type = box.dataset.type;
      detail.innerHTML = `<p style="text-align:center;color:#00eaff;">⏳ Načítavam...</p>`;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });

      try {
        const now = Date.now();

        if (lastStats && now - lastFetchTime < 30000) {
          renderStats(lastStats, type);
          return;
        }

        let resp = await fetch("/api/statistics", { cache: "no-store" });
        if (!resp.ok) throw new Error("Nepodarilo sa načítať dáta.");
        const data = await resp.json();

        lastStats = data;
        lastFetchTime = now;

        renderStats(data, type);
      } catch (err) {
        detail.innerHTML = `<p style="color:red;text-align:center;">❌ ${err.message}</p>`;
      }
    });
  });
}

// === Prepínanie sekcií a načítanie dát dynamicky ===
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
        case "home-section":
        await displayHome();
        break;
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
  console.log("🚀 Spúšťam NHLPRO...");

  // 1️⃣ Načítaj databázu hráčov
  await loadPlayerTeams();

  // 2️⃣ Skry všetky sekcie
  document.querySelectorAll(".section, .content-section").forEach(sec => {
    sec.style.display = "none";
  });

  // 3️⃣ Zobraz DOMOV a paralelne načítaj všetky dáta (ratingy, zápasy, AI tip)
  const home = document.getElementById("home-section");
  if (home) {
    home.style.display = "block";
    home.style.opacity = 0;
    setTimeout(() => (home.style.opacity = 1), 100);

    // ⚡ načítaj všetko paralelne
    await Promise.all([
      fetchMatches(),   // načíta zápasy + ratingy (aj playerRatings, teamRatings)
      displayHome()     // zobrazí AI tip, štatistiky, zápasy dňa
    ]);
  } else {
    // fallback ak chýba home
    await fetchMatches();
  }

  // 4️⃣ Po 3 sekundách ešte raz zaktualizuj cache (len pre istotu)
  setTimeout(() => {
    console.log("🔁 Aktualizujem dáta po načítaní...");
    fetchMatches(); // načíta znovu, ak boli dáta neúplné
  }, 3000);
});