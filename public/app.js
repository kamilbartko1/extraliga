// public/app.js
// public/app.js

let teamRatings = {};
let playerRatings = {};
let allMatches = [];
let playerTeams = {}; // mapovanie priezvisko → tím
let fullTeamNames = {};
let NHL_PLAYERS_BY_TEAM = {};
let PREMIUM_PLAYERS_CACHE = [];
let PREMIUM_SELECTS_READY = false;
let premiumPlayersLoaded = false;

const BASE_STAKE = 1;
const ODDS = 2.5;
const API_BASE = "";

// === Prihlasenie premium klientov cez supabase ===
const SUPABASE_URL = "https://ztjyvzulbrilyzfcxogj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_B8gvXJ59mQjIqytV8WnQqA__I3gpAat"; // ten začína sb_publishable_...

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

// === DOMOVSKÁ STRÁNKA – RÝCHLE NAČÍTANIE, AI SA DOLOŽÍ NESKÔR ===
async function displayHome() {
  const home = document.getElementById("home-section");
  if (!home) return;

  home.innerHTML = `
    <p style="text-align:center;color:#00eaff;">⏳ Načítavam domovskú stránku...</p>
  `;

  try {
    // 🔥 1️⃣ RÝCHLE API – len zápasy, štatistiky a AI história
    const [homeResp, statsResp, aiGetResp] = await Promise.all([
      fetch("/api/home", { cache: "no-store" }),
      fetch("/api/statistics", { cache: "no-store" }),
      fetch("/api/ai?task=get", { cache: "no-store" })
    ]);

    const homeData = await homeResp.json();
    const statsData = statsResp.ok ? await statsResp.json() : {};

    // AI história (bez dnešného live výpočtu)
    const aiData = aiGetResp.ok
      ? await aiGetResp.json()
      : { history: [], hits: 0, total: 0, successRate: 0 };

    const history = (aiData.history || []).filter(h => h.result !== "pending");

    // 🔝 Štatistiky hráčov
    const topGoal = statsData?.topGoals?.[0] || {};
    const topPoints = statsData?.topPoints?.[0] || {};
    const topShots = statsData?.topShots?.[0] || {};

    // 🔥 2️⃣ VŠETKO OKREM AI TIPU SA RENDERUJE HNEĎ
    let html = `
<section class="nhl-home">

  <!-- ================= HERO GRID ================= -->
  <div class="nhl-hero-grid">

    <!-- DNESNE ZAPASY -->
    <div class="nhl-card">
      <div class="nhl-card-head">
        <h3>🏒 Dnešné zápasy NHL</h3>
        <span class="nhl-card-hint">${homeData.matchesToday.length} zápasov</span>
      </div>

      <div class="nhl-games-list">
        ${
          homeData.matchesToday.length === 0
            ? `<p class="nhl-muted">Dnes nie sú žiadne zápasy.</p>`
            : homeData.matchesToday.slice(0,6).map(m => `
              <div class="nhl-game-row" onclick="showSection('matches-section')">
                <div class="nhl-game-teams">
                  <img src="${m.homeLogo}" class="nhl-team-logo">
                  <span>${m.homeName}</span>
                  <span class="nhl-vs">vs</span>
                  <span>${m.awayName}</span>
                  <img src="${m.awayLogo}" class="nhl-team-logo">
                </div>
                <div class="nhl-game-time">${m.startTime}</div>
              </div>
            `).join("")
        }
      </div>

      <button class="nhl-btn nhl-btn-link" onclick="showSection('matches-section')">
        Zobraziť všetky →
      </button>
    </div>

    <!-- AI STRELEC DNA -->
    <div class="nhl-card nhl-ai-card">
      <div class="nhl-card-head">
        <h3>🎯 AI strelec dňa</h3>
      </div>

      <div id="ai-today-loading" class="nhl-ai-center">
        <p class="nhl-muted">Načítavam AI tip…</p>
      </div>
    </div>

    <!-- HISTORIA AI -->
    <div class="nhl-card">
      <div class="nhl-card-head">
        <h3>📅 História AI tipov</h3>
      </div>

      <div class="nhl-ai-history">
        ${
          history.length === 0
            ? `<p class="nhl-muted">Žiadne vyhodnotené tipy</p>`
            : history.slice(0,6).map(h => `
              <div class="nhl-ai-row">
                <span>${h.date}</span>
                <span>${h.player}</span>
                <span class="${h.result === "hit" ? "hit" : "miss"}">
                  ${h.result === "hit" ? "✔" : "✘"}
                </span>
              </div>
            `).join("")
        }
      </div>
    </div>

  </div>

  <!-- ================= TOP STATISTIKY ================= -->
  <div class="nhl-section-head">
    <h2>📊 Top štatistiky hráčov</h2>
    <button class="nhl-btn nhl-btn-ghost" onclick="showSection('stats-section')">
      Zobraziť všetky
    </button>
  </div>

  <div class="nhl-stats-grid">

  <div class="top-player">
    <img src="${topGoal.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topGoal.name || "-"}</b><br>
      🥅 ${topGoal.goals || 0} gólov
    </div>
    <span class="stat-label">Top Góly</span>
  </div>

  <div class="top-player">
    <img src="${statsData?.topAssists?.[0]?.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${statsData?.topAssists?.[0]?.name || "-"}</b><br>
      🅰️ ${statsData?.topAssists?.[0]?.assists || 0} asistencií
    </div>
    <span class="stat-label">Top Asistencie</span>
  </div>

  <div class="top-player">
    <img src="${topPoints.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topPoints.name || "-"}</b><br>
      ⚡ ${topPoints.points || 0} bodov
    </div>
    <span class="stat-label">Top Body</span>
  </div>

  <div class="top-player">
    <img src="${statsData?.topPowerPlayGoals?.[0]?.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${statsData?.topPowerPlayGoals?.[0]?.name || "-"}</b><br>
      🔌 ${statsData?.topPowerPlayGoals?.[0]?.powerPlayGoals || 0} PP gólov
    </div>
    <span class="stat-label">Top PP</span>
  </div>

  <div class="top-player">
    <img src="${topShots.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topShots.name || "-"}</b><br>
      🎯 ${topShots.shots || 0} striel
    </div>
    <span class="stat-label">Top Strely</span>
  </div>

</div>

</section>
`;

home.innerHTML = html;

    // 🔥 3️⃣ AI STRELEC SA DOLOŽÍ EXTRA (NEBLOKUJE STRÁNKU)
    setTimeout(async () => {
      try {
        const resp = await fetch("/api/ai?task=scorer", { cache: "no-store" });
        if (!resp.ok) return;

        const data = await resp.json();
        const ai = data.aiScorerTip;

        const box = document.getElementById("ai-today-loading");
        if (!box) return;

        if (!ai) {
          box.innerHTML = `<p style="color:#aaa;">AI strelec sa nepodarilo vypočítať.</p>`;
          return;
        }

        box.innerHTML = `
          <img src="${ai.headshot}" class="player-headshot">
          <div class="ai-scorer-info">
            <p><b>${ai.player}</b> (${ai.team})</p>
            <p style="color:#00eaff;">${ai.match}</p>
            <p>Góly: <b>${ai.goals}</b> |  PP Góly: ${ai.powerPlayGoals}</p>
            <p>Strely: <b>${ai.shots}</b></p>
            <p>🧠 Pravdepodobnosť: 
              <b style="color:#ffcc00;">${ai.probability}%</b>
            </p>
          </div>
        `;
      } catch (err) {
        console.warn("AI scorer load failed:", err.message);
      }
    }, 300);

  } catch (err) {
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
  if (statusEl) {
    statusEl.textContent = "⏳ Načítavam zápasy a ratingy...";
  }

  try {
    const response = await fetch(`${API_BASE}/api/matches`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("❌ Server vrátil chybu:", txt);
      if (statusEl) {
        statusEl.textContent = "❌ Server vrátil chybu pri načítaní dát.";
      }
      return;
    }

    const data = await response.json();
    console.log("✅ Dáta z backendu:", data);

    // === STATUS TEXT ===
    const totalGames = Array.isArray(data.matches) ? data.matches.length : 0;
    const totalPlayers = data.playerRatings
      ? Object.keys(data.playerRatings).length
      : 0;

    if (statusEl) {
      statusEl.textContent = `✅ Dokončené: ${totalGames} zápasov | ${totalPlayers} hráčov v rebríčku`;
    }

    // === ZÁPASY ===
    allMatches = Array.isArray(data.matches) ? data.matches : [];

    if (!allMatches.length) {
      console.warn("⚠️ Žiadne zápasy v data.matches");
      if (statusEl) {
        statusEl.textContent = "⚠️ Žiadne odohrané zápasy";
      }
    } else {
      displayMatches(allMatches);
    }

    // === RATINGY ===
    teamRatings = data.teamRatings || {};
    playerRatings = data.playerRatings || {};

    displayPlayerRatings();
    displayMantingal();

    // === NHL STANDINGS (NOVÉ – LEN RENDER, ŽIADNY FETCH) ===
    if (Array.isArray(data.standings)) {
      renderStandings(data.standings);
    } else {
      console.warn("⚠️ Standings nie sú v odpovedi backendu");
    }

  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
    if (statusEl) {
      statusEl.textContent =
        "❌ Chyba pri načítaní dát. Skús obnoviť stránku.";
    }
  }
}

let matchesExpanded = false; // globálny flag pre Zobraziť viac

// === Zápasy ===
async function displayMatches(matches) {
  const recentBox = document.getElementById("matches-recent");
  const olderBox  = document.getElementById("matches-older");
  const moreBtn   = document.getElementById("matches-more-btn");

  if (!recentBox || !olderBox) return;

  recentBox.innerHTML = "";
  olderBox.innerHTML  = "";

  if (!matches || matches.length === 0) {
    recentBox.innerHTML = `<p class="nhl-muted">Žiadne odohrané zápasy.</p>`;
    if (moreBtn) moreBtn.style.display = "none";
    return;
  }

  // ===============================
  // Zoskupenie podľa dátumu
  // ===============================
  const grouped = {};
  for (const m of matches) {
    const date = m.date;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(m);
  }

  const days = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
  const today = new Date();
  const RECENT_LIMIT_DAYS = 7;

  let recentHtml = "";
  let olderHtml  = "";

  for (const day of days) {
    const d = new Date(day);
    const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));

    const formatted = d.toLocaleDateString("sk-SK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    let dayHtml = `
      <div class="match-day">
        <div class="match-day-header">${formatted}</div>
    `;

    for (const match of grouped[day]) {
      const home = match.home_team;
      const away = match.away_team;

      const hs = match.home_score ?? "-";
      const as = match.away_score ?? "-";

      const homeWin = hs > as;
      const awayWin = as > hs;

      const recapId = `recap-${match.id}`;

      dayHtml += `
        <div class="score-row">

          <div class="team left">
            <img src="https://assets.nhle.com/logos/nhl/svg/${match.home_abbrev}_light.svg"
                 class="team-logo"
                 alt="${home}">
            <span class="team-name">${home}</span>
          </div>

          <div class="score-center">
            <span class="score ${homeWin ? "win" : ""}">${hs}</span>
            <span class="sep">:</span>
            <span class="score ${awayWin ? "win" : ""}">${as}</span>
            <div id="${recapId}" class="highlight-slot"></div>
          </div>

          <div class="team right">
            <span class="team-name">${away}</span>
            <img src="https://assets.nhle.com/logos/nhl/svg/${match.away_abbrev}_light.svg"
                 class="team-logo"
                 alt="${away}">
          </div>

        </div>
      `;
    }

    dayHtml += `</div>`;

    if (diffDays <= RECENT_LIMIT_DAYS) recentHtml += dayHtml;
    else olderHtml += dayHtml;
  }

  recentBox.innerHTML = recentHtml;
  olderBox.innerHTML  = olderHtml;

  // ===============================
  // Toggle starších
  // ===============================
  if (moreBtn) {
    if (olderHtml) {
      moreBtn.style.display = "inline-block";
      if (!matchesExpanded) {
        olderBox.classList.add("hidden");
        moreBtn.textContent = "Zobraziť viac ↓";
      } else {
        olderBox.classList.remove("hidden");
        moreBtn.textContent = "Skryť staršie ↑";
      }
    } else {
      moreBtn.style.display = "none";
    }
  }

  // ===============================
  // 🎥 Zostrihy (nezmenené)
  // ===============================
  for (const day of days) {
    for (const match of grouped[day]) {
      if ((match.status || "").toLowerCase() !== "closed") continue;

      try {
        const resp = await fetch(
          `/api/highlights?team=${encodeURIComponent(match.home_team)}&id=${match.id}`,
          { cache: "no-store" }
        );
        const data = await resp.json();
        const cell = document.getElementById(`recap-${match.id}`);
        if (!cell) continue;

        if (data.ok && data.highlight) {
          cell.innerHTML = `<a href="${data.highlight}" target="_blank" class="highlight-link">🎥</a>`;
        }
      } catch {}
    }
  }
}

// === Tabulka render
function renderStandings(standings) {
  const box = document.getElementById("standings-table");
  if (!box) return;

  if (!Array.isArray(standings) || standings.length === 0) {
    box.innerHTML = `<p class="nhl-muted">Tabuľka nie je dostupná.</p>`;
    return;
  }

  const rows = standings
    .slice()
    .sort((a, b) => b.points - a.points);

  box.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Tím</th>
          <th>Z</th>
          <th>B</th>
          <th>GF</th>
          <th>GA</th>
          <th>+/-</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((t, i) => {
          const gf = t.goalFor ?? 0;
          const ga = t.goalAgainst ?? 0;
          const diff = gf - ga;

          return `
            <tr>
              <td>${i + 1}</td>
              <td class="team-cell">
                <img src="${t.teamLogo}" alt="${t.teamName?.default}">
                <span>${t.teamName?.default}</span>
              </td>
              <td>${t.gamesPlayed}</td>
              <td class="points">${t.points}</td>
              <td>${gf}</td>
              <td>${ga}</td>
              <td class="${diff >= 0 ? "pos" : "neg"}">
                ${diff > 0 ? "+" : ""}${diff}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
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

function openTeamRatingModal() {
  document.getElementById("teamRatingModal").style.display = "flex";
}

function closeTeamRatingModal(e) {
  if (!e || e.target.id === "teamRatingModal") {
    document.getElementById("teamRatingModal").style.display = "none";
  }
}

// DISCLAIMER MODAL
document.getElementById("open-disclaimer")
  ?.addEventListener("click", () => {
    document
      .getElementById("disclaimer-modal")
      .classList.remove("hidden");
  });

document.getElementById("close-disclaimer")
  ?.addEventListener("click", () => {
    document
      .getElementById("disclaimer-modal")
      .classList.add("hidden");
  });

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

function openRatingModal() {
  document.getElementById("ratingModal").style.display = "flex";
}

function closeRatingModal(e) {
  if (!e || e.target.id === "ratingModal") {
    document.getElementById("ratingModal").style.display = "none";
  }
}

// === Mantingal sekcia ===
async function loadMantingal() {
  const res = await fetch("/api/mantingal?task=all");
  const data = await res.json();
  if (!data.ok) return;

  document.getElementById("mtg-total-profit").textContent =
    data.totalProfit.toFixed(2);

  const tbody = document.getElementById("mantingale-table-body");
  tbody.innerHTML = "";

  Object.entries(data.players).forEach(([name, p]) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${name}</td>
      <td>${p.stake}</td>
      <td>${p.streak}</td>
      <td>${p.balance.toFixed(2)}</td>
      <td><button class="mtg-detail-btn" data-player="${name}">Detail</button></td>
    `;

    tbody.appendChild(tr);
  });

  // kliknutie na detail hráča
  document.querySelectorAll(".mtg-detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => showMantingalDetail(btn.dataset.player));
  });
}

/// ===================================
// VIP – delegované kliknutie na Detail
// ===================================
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("vip-mtg-detail-btn")) {
    console.log("👑 VIP DETAIL CLICK:", e.target.dataset.player);
    showVipMantingalDetail(e.target.dataset.player);
  }
});

async function showMantingalDetail(player) {
  const res = await fetch(
    `/api/mantingal?player=${encodeURIComponent(player)}`
  );

  const data = await res.json();
  if (!data.ok) return;

  document.getElementById("mtg-player-name").textContent = player;

  // ===================================
  // HISTÓRIA HRÁČA – GLOBAL
  // ===================================
  const tbody = document.getElementById("mtg-history-body");
  tbody.innerHTML = "";

  data.history
    .filter(h => h.result !== "skip")
    .forEach((h) => {
      tbody.innerHTML += `
        <tr>
          <td>${h.date}</td>
          <td>${h.gameId || "-"}</td>
          <td>${h.goals === null ? "-" : h.goals}</td>
          <td>${h.result}</td>
          <td>${h.profitChange}</td>
          <td>${h.balanceAfter}</td>
        </tr>
      `;
    });

  const detailBox = document.getElementById("mantingale-detail");
  detailBox.classList.remove("hidden");

  // ✅ AUTO SCROLL NA DETAIL
  detailBox.scrollIntoView({
    behavior: "smooth",
    block: "start",
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

// ===============================
// PREMIUM UI – RESET
// ===============================
function hideAllPremiumUI() {
  [
    "premium-not-logged",
    "premium-register-box",
    "premium-locked",
    "premium-content"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

async function checkPremiumStatus() {
  const section = document.getElementById("premium-section");
  if (!section) return;

  // ===== ZÁKLAD: skry všetko =====
  const loginBox   = document.getElementById("premium-not-logged");
  const registerBox = document.getElementById("premium-register-box");
  const lockedBox  = document.getElementById("premium-locked");
  const contentBox = document.getElementById("premium-content");
  const signupBtn  = document.getElementById("premium-signup-btn");
  const logoutBtn  = document.getElementById("premium-logout-btn");
  const authMsg    = document.getElementById("premium-auth-msg");

  [loginBox, registerBox, lockedBox, contentBox].forEach(el => {
    if (el) el.style.display = "none";
  });

  section.style.display = "block";
  if (authMsg) authMsg.textContent = "";

  const token = localStorage.getItem("sb-access-token");

  // ===== NIE JE PRIHLÁSENÝ =====
  if (!token) {
    if (loginBox) loginBox.style.display = "block";
    if (signupBtn) signupBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    return;
  }

  // ===== PRIHLÁSENÝ (lokálne) =====
  if (signupBtn) signupBtn.style.display = "none";
  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
    logoutBtn.onclick = premiumLogout;
  }

  try {
    const res = await fetch("/api/vip?task=status", {
      headers: { Authorization: `Bearer ${token}` }
    });

    // token neplatný
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem("sb-access-token");
      localStorage.removeItem("sb-refresh-token");

      if (loginBox) loginBox.style.display = "block";
      if (signupBtn) signupBtn.style.display = "inline-block";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (authMsg) authMsg.textContent = "Prihlásenie vypršalo. Prihlás sa znova.";
      return;
    }

    const data = await res.json();

// ===============================
// PREMIUM – Stripe Checkout
// ===============================
document.getElementById("premium-upgrade-btn")
  ?.addEventListener("click", async () => {

    const token = localStorage.getItem("sb-access-token");
    if (!token) {
      alert("Najprv sa musíš prihlásiť.");
      return;
    }

    try {
      const res = await fetch(
        "/api/vip?task=create_checkout_session",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await res.json();
      if (!data.ok || !data.url) {
        alert("Nepodarilo sa vytvoriť platbu.");
        return;
      }

      // 🔥 presmerovanie na Stripe Checkout
      window.location.href = data.url;

    } catch (err) {
      console.error(err);
      alert("Chyba pri spustení platby.");
    }
});
    
    // ===== VIP USER =====
if (data.ok && data.isVip === true) {
  if (contentBox) contentBox.style.display = "block";

  if (!premiumPlayersLoaded) {
    premiumPlayersLoaded = true;
    await loadPremiumTeams();
    await loadPremiumPlayers();
  }

  return;
}

    // ===== PRIHLÁSENÝ, ALE NIE VIP =====
    if (lockedBox) lockedBox.style.display = "block";
    // logout OSTÁVA viditeľný
  } catch (err) {
    console.error("❌ checkPremiumStatus error:", err);

    // fallback: vráť login
    localStorage.removeItem("sb-access-token");
    localStorage.removeItem("sb-refresh-token");

    if (loginBox) loginBox.style.display = "block";
    if (signupBtn) signupBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (authMsg) authMsg.textContent = "Chyba spojenia. Skús to znova.";
  }
}

// ===============================
// Odhlásenie
// ===============================
function premiumLogout() {
  localStorage.removeItem("sb-access-token");
  localStorage.removeItem("sb-refresh-token");
  location.reload();
}

// ===============================
// Klik: Registrovať sa → zobraz REGISTER
// ===============================
document.getElementById("premium-signup-btn")
  ?.addEventListener("click", () => {

    hideAllPremiumUI();

    const box = document.getElementById("premium-register-box");
    if (!box) return;

    box.style.display = "block";
    box.scrollIntoView({ behavior: "smooth", block: "center" });
});

// ===============================
// REGISTRÁCIA – SUPABASE SIGNUP
// ===============================
document.getElementById("premium-register-confirm")
  ?.addEventListener("click", async () => {

    const email = document.getElementById("reg-email")?.value.trim();
    const pass = document.getElementById("reg-pass")?.value;
    const pass2 = document.getElementById("reg-pass2")?.value;
    const msg = document.getElementById("premium-register-msg");

    if (!email || !pass || !pass2) {
      msg.textContent = "Vyplň všetky polia.";
      return;
    }

    if (pass.length < 8) {
      msg.textContent = "Heslo musí mať minimálne 8 znakov.";
      return;
    }

    if (pass !== pass2) {
      msg.textContent = "Heslá sa nezhodujú.";
      return;
    }

    msg.textContent = "⏳ Vytváram účet...";

    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/signup`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password: pass }),
        }
      );

      const data = await r.json();

      if (!r.ok) {
        msg.textContent = data?.error_description || data?.error || "Registrácia zlyhala.";
        return;
      }

      msg.textContent = "✅ Účet vytvorený. Skontroluj email.";

      setTimeout(() => {
        hideAllPremiumUI();
        document.getElementById("premium-not-logged").style.display = "block";
      }, 1500);

    } catch (err) {
      console.error(err);
      msg.textContent = "❌ Chyba pri registrácii.";
    }
});

// ===============================
// Uprava priezviska bez celeho mena
// ===============================
function formatPlayerName(fullName) {
  if (!fullName) return "";

  const parts = fullName.trim().split(" ");
  if (parts.length === 1) return fullName;

  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  return `${lastName} ${firstName.charAt(0)}.`;
}

// ===============================
// PREMIUM – Načítanie hráčov (s odds)
// ===============================
async function loadPremiumPlayers() {
  const token = localStorage.getItem("sb-access-token");
  const tbody = document.getElementById("premium-players-body");
  const totalEl = document.getElementById("premium-total-profit");
  const msg = document.getElementById("premium-msg");

  if (!tbody || !totalEl || !token) return;

  tbody.innerHTML = "";
  totalEl.textContent = "0.00";
  if (msg) msg.textContent = "";

  try {
    const res = await fetch("/api/vip?task=get_players", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!data.ok) {
      if (msg) msg.textContent = data.error;
      return;
    }

    const entries = Object.entries(data.players || {});
    totalEl.textContent = Number(data.totalProfit || 0).toFixed(2);

    if (!entries.length) {
      if (msg) msg.textContent = "Zatiaľ nemáš pridaných žiadnych hráčov.";
      return;
    }

    for (const [name, p] of entries) {

      const tr = document.createElement("tr");
      tr.innerHTML = `
  <td>${formatPlayerName(name)}</td>
  <td>${p.stake}</td>
  <td>${p.streak}</td>
  <td>${Number(p.balance).toFixed(2)} €</td>
  <td>${Number(p.odds || 2.2).toFixed(2)}</td>

  <td class="premium-actions">
    <button
      class="btn-detail vip-mtg-detail-btn"
      data-player="${name}"
    >
      Detail
    </button>

    <button
      class="btn-delete"
      onclick="deletePremiumPlayer('${encodeURIComponent(name)}')"
    >
      Vymazať
    </button>
  </td>
`;
      tbody.appendChild(tr);
    }

  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = "Chyba pri načítaní hráčov.";
  }
}

// ===================================
// 👑 VIP – HISTÓRIA HRÁČA
// ===================================
async function showVipMantingalDetail(player) {
  const token = localStorage.getItem("sb-access-token");
  if (!token) return;

  const res = await fetch(
    `/api/vip?task=history&player=${encodeURIComponent(player)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();
  if (!data.ok) {
    alert("Nepodarilo sa načítať históriu");
    return;
  }

  document.getElementById("vip-mtg-player-name").textContent = player;

  const tbody = document.getElementById("vip-mtg-history-body");
  tbody.innerHTML = "";

  data.history
    .filter(h => h.result !== "skip")
    .forEach((h) => {
      tbody.innerHTML += `
        <tr>
          <td>${h.date}</td>
          <td>${h.gameId || "-"}</td>
          <td>${h.goals === null ? "-" : h.goals}</td>
          <td>${h.result}</td>
          <td>${h.profitChange}</td>
          <td>${h.balanceAfter}</td>
        </tr>
      `;
    });

  const detailBox = document.getElementById("vip-mantingale-detail");
  detailBox.classList.remove("hidden");

  // 👑 AUTO SCROLL NA VIP DETAIL
  detailBox.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// ===============================
// Back Button vip
// ===============================
document
  .getElementById("vip-mtg-back-btn")
  ?.addEventListener("click", () => {
    document
      .getElementById("vip-mantingale-detail")
      .classList.add("hidden");
  });

// ===============================
// PREMIUM – Vymazať hráča
// ===============================
async function deletePremiumPlayer(encodedName) {
  const token = localStorage.getItem("sb-access-token");
  if (!token) return;

  const name = decodeURIComponent(encodedName);
  if (!confirm(`Naozaj chceš vymazať ${name}?`)) return;

  await fetch(`/api/vip?task=delete_player&player=${encodeURIComponent(name)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await loadPremiumPlayers();
}

// ===============================
// PREMIUM – Načítanie tímov + hráčov z JSON (s odds)
// ===============================
async function loadPremiumTeams() {
  const teamSelect = document.getElementById("premium-team-select");
  const playerSelect = document.getElementById("premium-player-select");

  if (!teamSelect || !playerSelect) return;

  teamSelect.innerHTML = `<option value="">-- vyber klub --</option>`;
  playerSelect.innerHTML = `<option value="">-- najprv vyber klub --</option>`;
  playerSelect.disabled = true;

  try {
    const res = await fetch("/data/nhl_players.json", { cache: "no-store" });
    if (!res.ok) throw new Error("players.json not found");

    const raw = await res.json();

    // 🔥 cache vrátane odds
    PREMIUM_PLAYERS_CACHE = raw.map(p => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      team: p.team,
      position: p.position,
      number: p.number,
      odds: Number(p.odds) || 2.2   // ⬅️ dôležité
    }));

    const teams = [...new Set(PREMIUM_PLAYERS_CACHE.map(p => p.team))].sort();

    teams.forEach(team => {
      const opt = document.createElement("option");
      opt.value = team;
      opt.textContent = team;
      teamSelect.appendChild(opt);
    });

    // 🔽 zmena tímu → naplň hráčov
    teamSelect.onchange = () => {
      const team = teamSelect.value;

      playerSelect.innerHTML = `<option value="">-- vyber hráča --</option>`;
      playerSelect.disabled = !team;

      if (!team) return;

      PREMIUM_PLAYERS_CACHE
        .filter(p => p.team === team)
        .forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.name;
          opt.textContent = `${p.name} (${p.odds})`;
          opt.dataset.odds = p.odds;   // ✅ TU SA TO DEJE
          playerSelect.appendChild(opt);
        });
    };

  } catch (err) {
    console.error("❌ loadPremiumTeams error:", err);
    teamSelect.innerHTML = `<option value="">⚠️ Chyba načítania tímov</option>`;
  }
}

// ===============================
// PREMIUM – Po výbere tímu zobraz hráčov
// ===============================
function renderPremiumPlayersForTeam(team) {
  const playerSelect = document.getElementById("premium-player-select");
  if (!playerSelect) return;

  playerSelect.innerHTML = "";
  playerSelect.disabled = true;

  if (!team) {
    playerSelect.innerHTML = `<option value="">-- najprv vyber klub --</option>`;
    return;
  }

  const players = PREMIUM_PLAYERS_CACHE
    .filter(p => p.team === team)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!players.length) {
    playerSelect.innerHTML = `<option value="">Žiadni hráči</option>`;
    return;
  }

  playerSelect.innerHTML = `<option value="">-- vyber hráča --</option>`;

  players.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} (#${p.number}, ${p.position})`;
    playerSelect.appendChild(opt);
  });

  playerSelect.disabled = false;
}

// ===============================
// PREMIUM – Pridanie hráča (s ODDS)
// ===============================
async function addPremiumPlayer() {
  console.log("🔥 addPremiumPlayer CLICKED");

  const token = localStorage.getItem("sb-access-token");
  const teamSelect = document.getElementById("premium-team-select");
  const playerSelect = document.getElementById("premium-player-select");
  const msg = document.getElementById("premium-msg");

  if (!token || !teamSelect?.value || !playerSelect?.value) {
    if (msg) msg.textContent = "Vyber klub aj hráča.";
    return;
  }

  const team = teamSelect.value;
  const player = playerSelect.value;

  // 🔥 ODDS Z <option data-odds="">
  const selectedOption =
    playerSelect.options[playerSelect.selectedIndex];
  const odds = selectedOption?.dataset?.odds;

  if (!odds) {
    if (msg) msg.textContent = "❌ Hráč nemá nastavený kurz (odds).";
    return;
  }

  if (msg) msg.textContent = "⏳ Pridávam hráča...";

  try {
    const res = await fetch(
      `/api/vip?task=add_player` +
        `&name=${encodeURIComponent(player)}` +
        `&team=${encodeURIComponent(team)}` +
        `&odds=${encodeURIComponent(odds)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();
    console.log("📦 add_player response:", data);

    if (!data.ok) {
      if (msg) msg.textContent = data.error || "Chyba pri pridávaní.";
      return;
    }

    if (msg) msg.textContent = `✅ ${player} pridaný (kurz ${odds})`;
    await loadPremiumPlayers();

  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = "❌ Chyba servera";
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

// ===============================
// 🧠 ABS – TOGGLE TEXT
// ===============================
document.addEventListener("click", (e) => {
  if (e.target.id !== "abs-toggle") return;

  const more = document.getElementById("abs-more");
  const btn = document.getElementById("abs-toggle");

  if (!more) return;

  const isOpen = more.style.display === "block";

  more.style.display = isOpen ? "none" : "block";
  btn.textContent = isOpen ? "Zobraziť viac ↓" : "Skryť ↑";
});

// === Prepínanie sekcií a načítanie dát dynamicky ===
document.querySelectorAll("nav button").forEach(btn => {
  btn.addEventListener("click", async () => {
    const targetId = btn.getAttribute("onclick")?.match(/'(.*?)'/)?.[1];
    if (!targetId) return;

    // 🔹 Skry všetky sekcie
    document.querySelectorAll(".section, .content-section").forEach(sec => {
      sec.style.display = "none";
    });

    // 🔹 Zobraz len tú vybranú
    const section = document.getElementById(targetId);
    if (section) section.style.display = "block";

    // 🔹 Dynamické načítanie obsahu
    switch (targetId) {
      case "home-section":
        await displayHome();
        break;

      case "matches-section":
        fetchMatches();
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

      case "premium-section":
        await checkPremiumStatus(); // 🔥 KĽÚČOVÉ
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
  document.querySelectorAll(".section, .content-section").forEach(sec => {
    sec.style.display = "none";
  });

  let targetId = "";
  switch (val) {
    case "matches": targetId = "matches-section"; break;
    case "teams": targetId = "teams-section"; break;
    case "players": targetId = "players-section"; break;
    case "mantingal": targetId = "mantingal-container"; break;
    case "premium": targetId = "premium-section"; break; // 🔥 ZMENA
    case "shooting": targetId = "shooting-section"; break;
    case "strategies": targetId = "strategies-section"; break;
  }

  const section = document.getElementById(targetId);
  if (section) section.style.display = "block";

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

    case "premium-section":
      await checkPremiumStatus(); // 🔥 KĽÚČOVÉ
      break;

    case "stats-section":
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

  // 3️⃣ Zobraz DOMOV
  const home = document.getElementById("home-section");
  if (home) {
    home.style.display = "block";
    home.style.opacity = 0;
    setTimeout(() => (home.style.opacity = 1), 100);

    await Promise.all([
      fetchMatches(),
      displayHome()
    ]);
  } else {
    await fetchMatches();
  }

  // ===============================
  // PREMIUM – LOGIN
  // ===============================
  document.getElementById("premium-login-btn")?.addEventListener("click", async () => {
    const email = document.getElementById("premium-email")?.value?.trim();
    const pass = document.getElementById("premium-pass")?.value;

    if (!email || !pass) {
      alert("Zadaj email aj heslo");
      return;
    }

    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password: pass }),
        }
      );

      const data = await r.json();

      if (!r.ok) {
        alert(data?.error_description || "Login error");
        return;
      }

      localStorage.setItem("sb-access-token", data.access_token);
      localStorage.setItem("sb-refresh-token", data.refresh_token);

      // refresh premium UI
      checkPremiumStatus();

    } catch (e) {
      alert("Chyba pri prihlásení");
      console.error(e);
    }
  });

  // ===============================
  // PREMIUM – LOGOUT (priame)
  // ===============================
  document.getElementById("premium-logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem("sb-access-token");
    localStorage.removeItem("sb-refresh-token");
    checkPremiumStatus();
  });

  // ===============================
  // PREMIUM – Logout (delegácia)
  // ===============================
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "premium-logout-btn") {
      console.log("🔓 PREMIUM logout");
      localStorage.removeItem("sb-access-token");
      location.reload();
    }
  });

  // ===============================
  // Potvrdenie registracie
  // ===============================
  document.getElementById("premium-register-confirm")
  ?.addEventListener("click", async () => {

    const email = document.getElementById("reg-email")?.value.trim();
    const pass = document.getElementById("reg-pass")?.value;
    const pass2 = document.getElementById("reg-pass2")?.value;
    const msg = document.getElementById("premium-register-msg");

    if (!email || !pass || !pass2) {
      msg.textContent = "Vyplň všetky polia.";
      return;
    }

    if (pass !== pass2) {
      msg.textContent = "Heslá sa nezhodujú.";
      return;
    }

    msg.textContent = "⏳ Registrujem používateľa...";

    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/signup`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password: pass
          }),
        }
      );

      const data = await r.json();

      if (!r.ok) {
        console.error("Supabase signup error:", data);
        msg.textContent = data?.error_description || data?.error || "Registrácia zlyhala.";
        return;
      }

      msg.textContent = "✅ Registrácia prebehla úspešne.";

      // ⚠️ ak máš zapnuté email potvrdenie:
      // user sa NEPRIHLÁSI hneď
      // musí kliknúť na link v emaile

      // ak email confirmation NEMÁŠ:
      if (data.access_token) {
        localStorage.setItem("sb-access-token", data.access_token);
        localStorage.setItem("sb-refresh-token", data.refresh_token);
        checkPremiumStatus();
      } else {
        msg.textContent += " Skontroluj email pre potvrdenie.";
      }

    } catch (e) {
      console.error(e);
      msg.textContent = "❌ Chyba pri registrácii.";
    }
});

// ===============================
// PREMIUM – Pridať hráča (PRIAMY listener)
// ===============================
document.getElementById("premium-add-player-btn")
  ?.addEventListener("click", (e) => {
    e.preventDefault();
    addPremiumPlayer();
  });

  // ===============================
  // PREMIUM – Akcie (delegácia)
  // ===============================
  document.addEventListener("click", (e) => {

    // 🗑️ Vymazať hráča
    if (e.target && e.target.classList && e.target.classList.contains("premium-del-btn")) {
      const p = e.target.getAttribute("data-player");
      deletePremiumPlayer(p);
    }

  });

  // 4️⃣ Soft refresh po 3s
  setTimeout(() => {
    console.log("🔁 Aktualizujem dáta po načítaní...");
    fetchMatches();
  }, 3000);
});
