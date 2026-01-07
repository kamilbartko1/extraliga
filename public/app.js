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
let LAST_STANDINGS = [];

const BASE_STAKE = 1;
const ODDS = 2.5;
const API_BASE = "";

// =========================================================
// i18n (SK / EN) – frontend only (backend untouched)
// =========================================================

const I18N = {
  sk: {
    "header.tagline": "Tipuj NHL ako profík!",
    "header.powered": "Powered by <span>AI-Logic</span>",

    "nav.home": "Domov",
    "nav.results": "Výsledky",
    "nav.teamRating": "Rating tímov",
    "nav.playerRating": "Rating hráčov",
    "nav.stats": "Štatistiky hráčov",
    "nav.abs": "AdvancedBettingStrategy",
    "nav.premium": "NHLPRO PREMIUM",

    "sections.home": "Domov",
    "sections.resultsTitle": "Výsledky & tabuľka NHL",
    "sections.teamRating": "Rating tímov",
    "sections.playerRating": "Rating hráčov",
    "sections.statsTitle": "📊 ŠTATISTIKY HRÁČOV NHL",

    "table.team": "Tím",
    "table.player": "Hráč",
    "table.rating": "Rating",

    "common.loading": "Načítavam…",
    "common.showMore": "Zobraziť viac ↓",
    "common.hide": "Skryť ↑",
    "common.back": "← Späť",
    "common.close": "Zavrieť",
    "common.detail": "Detail",
    "common.delete": "Vymazať",

    "footer.disclaimer": "⚖️ Právny disclaimer",
    "footer.privacy": "🔒 Ochrana osobných údajov",
    "footer.terms": "📋 Podmienky používania",

    "home.loading": "⏳ Načítavam domovskú stránku...",
    "home.heroTitle": "Použi pokročilú stratégiu tipovania",
    "home.heroSubtitle": "Advanced Betting Strategy pre maximálny zisk z NHL stávok",
    "home.ctaStart": "Začať teraz",
    "home.ctaLearn": "Zistiť viac",
    "home.statTotalProfit": "Celkový zisk",
    "home.statTotalPlayers": "Aktívnych hráčov",
    "home.statStrategy": "ABS Stratégia",
    "home.featuresTitle": "Prečo si vybrať nás?",
    "home.featureAI": "AI Analýza",
    "home.featureAIDesc": "Pokročilá AI analýza pomáha predpovedať výsledky s vyššou presnosťou",
    "home.featureStats": "Kompletné štatistiky",
    "home.featureStatsDesc": "Dostup k detailným štatistikám hráčov a tímov v reálnom čase",
    "home.featureStrategy": "ABS Stratégia",
    "home.featureStrategyDesc": "Advanced Betting Strategy pre maximálny zisk",
    "home.featureRealTime": "Aktuálne dáta",
    "home.featureRealTimeDesc": "Vždy najnovšie výsledky, tabuľky a štatistiky",
    "home.featureCTA": "Vyskúšať Premium",
    "home.todaysGames": "🏒 Dnešné zápasy NHL",
    "home.gamesCount": "{count} zápasov",
    "home.noGamesToday": "Dnes nie sú žiadne zápasy.",
    "home.viewAll": "Zobraziť všetky →",
    "home.aiScorer": "🎯 AI strelec dňa",
    "home.aiLoading": "Načítavam AI tip…",
    "home.aiFailed": "AI strelec sa nepodarilo vypočítať.",
    "home.aiHistory": "📅 História AI tipov",
    "home.noTips": "Žiadne vyhodnotené tipy",
    "home.topStats": "📊 Top štatistiky hráčov",
    "home.viewAllStats": "Zobraziť všetky",
    "home.topGoals": "Top Góly",
    "home.topAssists": "Top Asistencie",
    "home.topPoints": "Top Body",
    "home.topPP": "Top PP",
    "home.topShots": "Top Strely",
    "home.statGoals": "{n} gólov",
    "home.statAssists": "{n} asistencií",
    "home.statPoints": "{n} bodov",
    "home.statShots": "{n} striel",

    "matches.loading": "⏳ Načítavam zápasy a ratingy...",
    "matches.serverError": "❌ Server vrátil chybu pri načítaní dát.",
    "matches.done": "✅ Dokončené: {games} zápasov | {players} hráčov v rebríčku",
    "matches.noGames": "⚠️ Žiadne odohrané zápasy",
    "matches.noFinished": "Žiadne odohrané zápasy.",
    "matches.more": "Zobraziť viac ↓",
    "matches.less": "Skryť staršie ↑",
    "matches.resultsBox": "Výsledky",
    "matches.standingsBox": "Tabuľka NHL",
    "matches.loadingStandings": "Načítavam tabuľku…",
    "matches.standingsUnavailable": "Tabuľka nie je dostupná.",

    "mantingale.totalProfit": "CELKOVÝ PROFIT",
    "mantingale.stake": "Stávka /EUR/",
    "mantingale.streak": "Streak",
    "mantingale.balance": "Balance (€)",
    "mantingale.roi": "ROI (%)",
    "mantingale.detail": "Detail",
    "mantingale.date": "Dátum",
    "mantingale.game": "Zápas",
    "mantingale.goals": "Góly",
    "mantingale.result": "Výsledok",
    "mantingale.change": "Zmena (€)",

    "stats.goals": "Góly",
    "stats.assists": "Asistencie",
    "stats.points": "Kanadské body",
    "stats.shots": "Strely",
    "stats.accuracy": "Percentá streľby",
    "stats.plusminus": "Plus / mínus",
    "stats.ppg": "Góly v presilovkách",
    "stats.toi": "Odohrané minúty",
    "stats.pim": "Vylúčenia",

    "premium.title": "👑 NHLPRO PREMIUM",
    "premium.subtitle": "Advanced betting strategy",
    "premium.loginHint": "Najprv sa prihlás, aby si mohol používať NHLPRO PREMIUM.",
    "premium.email": "Email",
    "premium.password": "Heslo",
    "premium.passwordRepeat": "Zopakuj heslo",
    "premium.login": "Prihlásiť",
    "premium.logout": "Odhlásiť sa",
    "premium.register": "Registrovať sa",
    "premium.registerTitle": "📝 Registrácia do NHLPRO",
    "premium.registerConfirm": "Zaregistrovať sa",
    "premium.backHome": "← Späť na hlavnú stránku",
    "premium.lockedTitle": "Aktivuj NHLPRO PREMIUM",
    "premium.lockedHint": "Táto sekcia je dostupná len pre členov <strong>NHLPRO PREMIUM</strong>. Pre aktiváciu si musíš zaplatiť mesačné predplatné.",
    "premium.lockedPrice": "Mesačné predplatné: <strong>4,99 €</strong>",
    "premium.lockedFeaturesTitle": "Čo získavaš ako VIP klient?",
    "premium.upgrade": "Staň sa NHLPRO PREMIUM",
    "premium.welcome": "Vitaj v NHLPRO PREMIUM 👑",
    "premium.pickTeam": "Vyber klub",
    "premium.pickPlayer": "Vyber hráča",
    "premium.addPlayer": "Pridať hráča",
    "premium.advancedStats": "📊 Detailné štatistiky",
    "premium.totalProfit": "Celkový profit",
    "premium.tableStake": "Stávka",
    "premium.tableStreak": "Streak",
    "premium.tableBalance": "Balance",
    "premium.tableOdds": "Kurzy",
    "premium.tableActions": "Akcie",
    "premium.loginNeed": "Zadaj email aj heslo",
    "premium.loginFailed": "Chyba pri prihlásení",
    "premium.loginExpired": "Prihlásenie vypršalo. Prihlás sa znova.",
    "premium.connectionError": "Chyba spojenia. Skús to znova.",
    "premium.fillAll": "Vyplň všetky polia.",
    "premium.passMin": "Heslo musí mať minimálne 8 znakov.",
    "premium.passMismatch": "Heslá sa nezhodujú.",
    "premium.creatingAccount": "⏳ Vytváram účet...",
    "premium.accountCreated": "✅ Účet vytvorený. Skontroluj email.",
    "premium.registerError": "❌ Chyba pri registrácii.",
    "premium.paymentStartError": "Chyba pri spustení platby.",
    "premium.addPick": "Vyber klub aj hráča.",
    "premium.noOdds": "❌ Hráč nemá nastavený kurz (odds).",
    "premium.adding": "⏳ Pridávam hráča...",
    "premium.added": "✅ {player} pridaný (kurz {odds})",
    "premium.serverError": "❌ Chyba servera",
    "premium.loadPlayersError": "Chyba pri načítaní hráčov.",
    "premium.confirmDelete": "Naozaj chceš vymazať {name}?",
    "premium.selectTeamPlaceholder": "-- vyber klub --",
    "premium.selectTeamFirst": "-- najprv vyber klub --",
    "premium.selectPlayerPlaceholder": "-- vyber hráča --",
    "premium.teamsLoadError": "⚠️ Chyba načítania tímov",
    "premium.analyticsTitle": "📊 Detailné štatistiky (posledných 10 zápasov)",
    "premium.analyticsSubtitle": "Pokročilá forma, ofenzíva a defenzíva tímov NHL",
    "premium.boxForm": "🔥 TOP forma",
    "premium.boxOffense": "🥅 TOP ofenzíva",
    "premium.boxDefense": "🚨 Najslabšia obrana",
    "premium.boxTrend": "📈 Zmena formy (trend)",
    "premium.infoTitle": "Čo získavaš ako VIP klient?",
    "premium.featureVipTips": "VIP AI Tipy",
    "premium.featureVipTipsDesc": "Autonómne tipy na strelcov a góly založené na ratingoch a štatistikách z posledných 10 zápasov",
    "premium.featureAbs": "ABS Stratégia",
    "premium.featureAbsDesc": "Pridávaj vlastných hráčov do Advanced Betting Strategy a sleduj ich sériu a profit",
    "premium.featureAnalytics": "Detailná Analytika",
    "premium.featureAnalyticsDesc": "Štatistiky z posledných 10 zápasov: forma, ofenzíva, obrana a trendy tímov",
    "premium.absStrategyTitle": "🎯 Moja ABS Stratégia",
    "premium.absStrategyDesc": "Pridaj hráčov do svojej Advanced Betting Strategy a sleduj ich výkonnosť a profit.",

    "vipTips.title": "🔥 VIP tipy na dnes",
    "vipTips.subtitle": "Autonómne tipy na strelcov a góly podľa ratingov a štatistík z posledných 10 zápasov.",
    "vipTips.loading": "Načítavam VIP tipy…",
    "vipTips.noGames": "Dnes nie sú žiadne zápasy na tipovanie.",
    "vipTips.sectionScorers": "Tipy na strelcov (Top 3)",
    "vipTips.sectionTotals": "Tipy na góly v zápase",
    "vipTips.confidence": "Confidence",
    "vipTips.predictedTotal": "Odhad gólov",
    "vipTips.reco": "Odporúčanie",
    "vipTips.over": "Over",
    "vipTips.under": "Under",
    "vipTips.noReco": "Bez odporúčania",
    "vipTips.vs": "vs",
    "vipTips.analysis": "Analýza",
    "vipTips.analysisTitle": "Detailná analýza hráča",
    "vipTips.analysisWhy": "Prečo by mal dať gól",
    "vipTips.analysisGoals": "Góly (sezóna)",
    "vipTips.analysisAssists": "Asistencie (sezóna)",
    "vipTips.analysisPoints": "Body (sezóna)",
    "vipTips.analysisShots": "Strely (sezóna)",
    "vipTips.analysisGames": "Zápasy",
    "vipTips.analysisClose": "Zavrieť",

    "modal.team.title": "🧠 Ako funguje NHLPRO Rating tímov?",
    "modal.player.title": "🧠 Ako funguje NHLPRO Rating hráčov?",

    "abs.title": "🧠 ABS – Advanced Betting Strategy",
    "abs.intro": "ABS je analytická stávková stratégia založená na systematickom bankroll manažmente a progresívnom vyhodnocovaní výkonov konkrétnych hráčov NHL.",
    "abs.more1": "Každý hráč má vlastnú stávkovú sériu, ktorá sa vyhodnocuje nezávisle. Po výhre sa séria resetuje, po prehre sa výška stávky upravuje podľa presne definovaných pravidiel stratégie.",
    "abs.more2": "V tabuľke nižšie vidíš aktuálnu stávku hráčov, ktorých autonómne vybral systém vypočtov AI, a ich stake, streak, profit a detailnú históriu každého hráča. V NHLPRO PREMIUM môžeš pridávať vlastných hráčov podľa svojho výberu.",
    "abs.warn": "⚠️ ABS nie je záruka výhry. Ide o štatistickú stratégiu určenú pre disciplinovaných používateľov so zodpovedným prístupom k bankrollu.",

    "absCta.title": "Chceš si vybrať vlastných hráčov do ABS?",
    "absCta.subtitle": "Zaregistruj sa a aktivuj členstvo len za <strong>4,99 € mesačne</strong> a získaj prístup k <strong>AI tipom na každý deň</strong>, detailným štatistikám formy tímov za posledných 10 zápasov a možnosti pridávať vlastných hráčov s ABS sériou.",
    "absCta.button": "Registrovať sa",
    "abs.disclaimer": "⚠️ <strong>UPOZORNENIE:</strong> Táto sekcia je len <strong>informatívna edukatívna simulácia</strong>. <strong>Nejde o skutočné stávkovanie</strong> a nenabádame klientov, aby podľa týchto informácií konali.",

    "disclaimer.title": "⚖️ PRÁVNY DISCLAIMER – NHLPRO.sk",

    "common.noData": "⚠️ Žiadne dáta.",
    "common.failedToLoad": "Nepodarilo sa načítať dáta.",

    "mantingale.title": "ABS stratégia",
    "mantingale.loadingData": "Načítavam dáta...",
    "mantingale.loadFailed": "❌ Nepodarilo sa načítať dáta ABS.",
    "mantingale.historyTitle": "História stávok ABS",
    "mantingale.historyLoadFailed": "❌ Nepodarilo sa načítať históriu stávok.",
    "mantingale.historyEmpty": "Zatiaľ žiadne dáta.",

    "strategies.title": "Databáza hráčov NHL",
    "strategies.loading": "Načítavam údaje z lokálnej databázy...",
    "strategies.count": "Počet hráčov v databáze: <b>{count}</b>",
    "strategies.showFirst": "Zobrazených prvých 300 hráčov:",

    "premium.mustLoginFirst": "Najprv sa musíš prihlásiť.",
    "premium.paymentCreateFailed": "Nepodarilo sa vytvoriť platbu.",
    "premium.historyLoadFailed": "Nepodarilo sa načítať históriu",
    "premium.noPlayers": "Zatiaľ nemáš pridaných žiadnych hráčov.",
    "premium.registeringUser": "⏳ Registrujem používateľa...",
    "premium.signupSuccess": "✅ Registrácia prebehla úspešne.",
    "premium.checkEmailConfirm": " Skontroluj email pre potvrdenie.",
    "premium.signupFailed": "Registrácia zlyhala.",
  },
  en: {
    "header.tagline": "Bet NHL like a pro!",
    "header.powered": "Powered by <span>AI-Logic</span>",

    "nav.home": "Home",
    "nav.results": "Results",
    "nav.teamRating": "Team rating",
    "nav.playerRating": "Player rating",
    "nav.stats": "Player stats",
    "nav.abs": "AdvancedBettingStrategy",
    "nav.premium": "NHLPRO PREMIUM",

    "sections.home": "Home",
    "sections.resultsTitle": "Results & NHL standings",
    "sections.teamRating": "Team rating",
    "sections.playerRating": "Player rating",
    "sections.statsTitle": "📊 NHL PLAYER STATS",

    "table.team": "Team",
    "table.player": "Player",
    "table.rating": "Rating",

    "common.loading": "Loading…",
    "common.showMore": "Show more ↓",
    "common.hide": "Hide ↑",
    "common.back": "← Back",
    "common.close": "Close",
    "common.detail": "Detail",
    "common.delete": "Delete",

    "footer.disclaimer": "⚖️ Legal disclaimer",

    "home.loading": "⏳ Loading home…",
    "home.heroTitle": "Use Advanced Betting Strategy",
    "home.heroSubtitle": "Advanced Betting Strategy for maximum profit from NHL bets",
    "home.ctaStart": "Get Started",
    "home.ctaLearn": "Learn More",
    "home.statTotalProfit": "Total Profit",
    "home.statTotalPlayers": "Active Players",
    "home.statStrategy": "ABS Strategy",
    "home.featuresTitle": "Why Choose Us?",
    "home.featureAI": "AI Analysis",
    "home.featureAIDesc": "Advanced AI analysis helps predict outcomes with higher accuracy",
    "home.featureStats": "Complete Statistics",
    "home.featureStatsDesc": "Access detailed player and team statistics in real-time",
    "home.featureStrategy": "ABS Strategy",
    "home.featureStrategyDesc": "Advanced Betting Strategy for maximum profit",
    "home.featureRealTime": "Real-time Data",
    "home.featureRealTimeDesc": "Always the latest results, standings and statistics",
    "home.featureCTA": "Try Premium",
    "home.todaysGames": "🏒 Today's NHL games",
    "home.gamesCount": "{count} games",
    "home.noGamesToday": "No games today.",
    "home.viewAll": "View all →",
    "home.aiScorer": "🎯 AI scorer of the day",
    "home.aiLoading": "Loading AI pick…",
    "home.aiFailed": "Could not compute today's AI scorer.",
    "home.aiHistory": "📅 AI picks history",
    "home.noTips": "No evaluated picks yet",
    "home.topStats": "📊 Top player stats",
    "home.viewAllStats": "View all",
    "home.topGoals": "Top Goals",
    "home.topAssists": "Top Assists",
    "home.topPoints": "Top Points",
    "home.topPP": "Top PP",
    "home.topShots": "Top Shots",
    "home.statGoals": "{n} goals",
    "home.statAssists": "{n} assists",
    "home.statPoints": "{n} points",
    "home.statShots": "{n} shots",

    "matches.loading": "⏳ Loading games and ratings…",
    "matches.serverError": "❌ Server returned an error while loading data.",
    "matches.done": "✅ Done: {games} games | {players} players in rankings",
    "matches.noGames": "⚠️ No finished games",
    "matches.noFinished": "No finished games.",
    "matches.more": "Show more ↓",
    "matches.less": "Hide older ↑",
    "matches.resultsBox": "Results",
    "matches.standingsBox": "NHL standings",
    "matches.loadingStandings": "Loading standings…",
    "matches.standingsUnavailable": "Standings are not available.",

    "mantingale.totalProfit": "TOTAL PROFIT",
    "mantingale.stake": "Stake (EUR)",
    "mantingale.streak": "Streak",
    "mantingale.balance": "Balance (€)",
    "mantingale.roi": "ROI (%)",
    "mantingale.detail": "Detail",
    "mantingale.date": "Date",
    "mantingale.game": "Game",
    "mantingale.goals": "Goals",
    "mantingale.result": "Result",
    "mantingale.change": "Change (€)",

    "stats.goals": "Goals",
    "stats.assists": "Assists",
    "stats.points": "Points",
    "stats.shots": "Shots",
    "stats.accuracy": "Shooting %",
    "stats.plusminus": "Plus / minus",
    "stats.ppg": "Power-play goals",
    "stats.toi": "Time on ice",
    "stats.pim": "Penalty minutes",

    "premium.title": "👑 NHLPRO PREMIUM",
    "premium.subtitle": "Advanced betting strategy",
    "premium.loginHint": "Log in first to use NHLPRO PREMIUM.",
    "premium.email": "Email",
    "premium.password": "Password",
    "premium.passwordRepeat": "Repeat password",
    "premium.login": "Log in",
    "premium.logout": "Log out",
    "premium.register": "Create account",
    "premium.registerTitle": "📝 Create NHLPRO account",
    "premium.registerConfirm": "Create account",
    "premium.backHome": "← Back to homepage",
    "premium.lockedTitle": "Activate NHLPRO PREMIUM",
    "premium.lockedHint": "This section is available only to <strong>NHLPRO PREMIUM</strong> members. To activate, you must pay the monthly subscription.",
    "premium.lockedPrice": "Monthly subscription: <strong>€4.99</strong>",
    "premium.lockedFeaturesTitle": "What do you get as a VIP client?",
    "premium.upgrade": "Become NHLPRO PREMIUM",
    "premium.welcome": "Welcome to NHLPRO PREMIUM 👑",
    "premium.pickTeam": "Select team",
    "premium.pickPlayer": "Select player",
    "premium.addPlayer": "Add player",
    "premium.advancedStats": "📊 Detailed statistics",
    "premium.totalProfit": "Total profit",
    "premium.tableStake": "Stake",
    "premium.tableStreak": "Streak",
    "premium.tableBalance": "Balance",
    "premium.tableOdds": "Odds",
    "premium.tableActions": "Actions",
    "premium.loginNeed": "Please enter email and password",
    "premium.loginFailed": "Login failed",
    "premium.loginExpired": "Session expired. Please log in again.",
    "premium.connectionError": "Connection error. Please try again.",
    "premium.fillAll": "Please fill in all fields.",
    "premium.passMin": "Password must be at least 8 characters.",
    "premium.passMismatch": "Passwords do not match.",
    "premium.creatingAccount": "⏳ Creating account...",
    "premium.accountCreated": "✅ Account created. Check your email.",
    "premium.registerError": "❌ Registration error.",
    "premium.paymentStartError": "Error while starting payment.",
    "premium.addPick": "Select a team and a player.",
    "premium.noOdds": "❌ This player has no odds set.",
    "premium.adding": "⏳ Adding player...",
    "premium.added": "✅ {player} added (odds {odds})",
    "premium.serverError": "❌ Server error",
    "premium.loadPlayersError": "Failed to load players.",
    "premium.confirmDelete": "Are you sure you want to delete {name}?",
    "premium.selectTeamPlaceholder": "-- select team --",
    "premium.selectTeamFirst": "-- select team first --",
    "premium.selectPlayerPlaceholder": "-- select player --",
    "premium.teamsLoadError": "⚠️ Failed to load teams",
    "premium.analyticsTitle": "📊 Detailed stats (last 10 games)",
    "premium.analyticsSubtitle": "Advanced form, offense and defense for NHL teams",
    "premium.boxForm": "🔥 TOP form",
    "premium.boxOffense": "🥅 TOP offense",
    "premium.boxDefense": "🚨 Weakest defense",
    "premium.boxTrend": "📈 Form change (trend)",
    "premium.infoTitle": "What do you get as a VIP client?",
    "premium.featureVipTips": "VIP AI Tips",
    "premium.featureVipTipsDesc": "Autonomous tips for scorers and goals based on ratings and statistics from the last 10 games",
    "premium.featureAbs": "ABS Strategy",
    "premium.featureAbsDesc": "Add your own players to Advanced Betting Strategy and track their series and profit",
    "premium.featureAnalytics": "Detailed Analytics",
    "premium.featureAnalyticsDesc": "Statistics from the last 10 games: form, offense, defense and team trends",
    "premium.absStrategyTitle": "🎯 My ABS Strategy",
    "premium.absStrategyDesc": "Add players to your Advanced Betting Strategy and track their performance and profit.",

    "vipTips.title": "🔥 VIP tips for today",
    "vipTips.subtitle": "Autonomous scorer and goals tips based on ratings and stats from the last 10 games.",
    "vipTips.loading": "Loading VIP tips…",
    "vipTips.noGames": "No games to tip today.",
    "vipTips.sectionScorers": "Scorer picks (Top 3)",
    "vipTips.sectionTotals": "Game total goals picks",
    "vipTips.confidence": "Confidence",
    "vipTips.predictedTotal": "Estimated goals",
    "vipTips.reco": "Recommendation",
    "vipTips.over": "Over",
    "vipTips.under": "Under",
    "vipTips.noReco": "No recommendation",
    "vipTips.vs": "vs",
    "vipTips.analysis": "Analysis",
    "vipTips.analysisTitle": "Player detailed analysis",
    "vipTips.analysisWhy": "Why he should score",
    "vipTips.analysisGoals": "Goals (season)",
    "vipTips.analysisAssists": "Assists (season)",
    "vipTips.analysisPoints": "Points (season)",
    "vipTips.analysisShots": "Shots (season)",
    "vipTips.analysisGames": "Games",
    "vipTips.analysisClose": "Close",

    "modal.team.title": "🧠 How does NHLPRO team rating work?",
    "modal.player.title": "🧠 How does NHLPRO player rating work?",

    "abs.title": "🧠 ABS – Advanced Betting Strategy",
    "abs.intro": "ABS is an analytics-driven betting strategy focused on bankroll management and progressive evaluation of specific NHL players.",
    "abs.more1": "Each player has an independent betting series. After a win, the series resets; after a loss, the stake adjusts based on predefined rules.",
    "abs.more2": "In the table below you can see the current stake of players that were autonomously selected by the AI calculation system, their stake, streak, profit and detailed history per player. In NHLPRO PREMIUM you can add your own players.",
    "abs.warn": "⚠️ ABS is not a guarantee of profit. It is intended for disciplined users with responsible bankroll management.",

    "absCta.title": "Want to pick your own players for ABS?",
    "absCta.subtitle": "Register and activate membership for just <strong>€4.99 per month</strong> and get access to <strong>daily AI tips</strong>, detailed team form statistics for the last 10 games, and the ability to add your own players with ABS series.",
    "absCta.button": "Create account",
    "abs.disclaimer": "⚠️ <strong>WARNING:</strong> This section is only an <strong>informative educational simulation</strong>. <strong>This is not real betting</strong> and we do not encourage clients to act based on this information.",

    "disclaimer.title": "⚖️ LEGAL DISCLAIMER – NHLPRO.sk",

    "common.noData": "⚠️ No data.",
    "common.failedToLoad": "Failed to load data.",

    "mantingale.title": "ABS strategy",
    "mantingale.loadingData": "Loading data...",
    "mantingale.loadFailed": "❌ Failed to load ABS data.",
    "mantingale.historyTitle": "ABS bet history",
    "mantingale.historyLoadFailed": "❌ Failed to load bet history.",
    "mantingale.historyEmpty": "No data yet.",

    "strategies.title": "NHL players database",
    "strategies.loading": "Loading from local database...",
    "strategies.count": "Players in database: <b>{count}</b>",
    "strategies.showFirst": "Showing first 300 players:",

    "premium.mustLoginFirst": "Please log in first.",
    "premium.paymentCreateFailed": "Could not create payment.",
    "premium.historyLoadFailed": "Failed to load history",
    "premium.noPlayers": "You haven't added any players yet.",
    "premium.registeringUser": "⏳ Creating user...",
    "premium.signupSuccess": "✅ Registration successful.",
    "premium.checkEmailConfirm": " Check your email to confirm.",
    "premium.signupFailed": "Registration failed.",
  }
};

let CURRENT_LANG = (localStorage.getItem("nhlpro_lang") || "").toLowerCase();
if (!["sk", "en"].includes(CURRENT_LANG)) {
  const navLang = (navigator.language || "sk").toLowerCase();
  CURRENT_LANG = navLang.startsWith("en") ? "en" : "sk";
}

function t(key, vars = {}) {
  const raw = I18N[CURRENT_LANG]?.[key] ?? I18N.sk[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function applyStaticI18n() {
  document.documentElement.setAttribute("lang", CURRENT_LANG);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (!key) return;
    el.innerHTML = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });
}

function renderTeamRatingModalContent() {
  // Keep it short and clear
  const items = CURRENT_LANG === "en"
    ? {
        intro: "<b>NHLPRO Team Rating</b> is a custom performance index that combines results, form, offense, defense and special teams across the season.",
        form: ["Wins", "Losses", "Winning / losing streaks"],
        off: ["Goals scored", "Power play efficiency (PP %)"],
        def: ["Goals against", "Penalty kill efficiency (PK %)", "Goalie impact (basic)"],
        spec: ["Power play", "Penalty kill", "Power-play goals", "Short-handed defense"],
        stab: "The rating tracks long-term consistency and balance between offense and defense.",
      }
    : {
        intro: "<b>NHLPRO Team Rating</b> je vlastný analytický index výkonnosti tímov, ktorý kombinuje výsledky, formu, ofenzívu, defenzívu a špeciálne formácie počas sezóny.",
        form: ["Víťazstvá", "Prehry", "Séria výhier / prehier"],
        off: ["Počet strelených gólov", "Efektivita presiloviek (PP %)"],
        def: ["Inkasované góly", "Účinnosť oslabení (PK %)", "Brankársky výkon (základný vplyv)"],
        spec: ["Presilovky", "Oslabenia", "Presilovkové góly", "Defenzíva v oslabení"],
        stab: "Rating sleduje dlhodobú konzistentnosť tímu a rovnováhu medzi útokom a obranou.",
      };

  return `
    <h2>${t("modal.team.title")}</h2>
    <p>${items.intro}</p>

    <h3>${CURRENT_LANG === "en" ? "🔥 Results & form" : "🔥 Výsledky & forma"}</h3>
    <ul>${items.form.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "🎯 Offense" : "🎯 Ofenzíva"}</h3>
    <ul>${items.off.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "🛡️ Defense" : "🛡️ Defenzíva"}</h3>
    <ul>${items.def.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "⚡ Special teams" : "⚡ Špeciálne formácie"}</h3>
    <ul>${items.spec.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "📈 Long-term stability" : "📈 Celková stabilita"}</h3>
    <p>${items.stab}</p>

    <button class="close-modal-btn" onclick="closeTeamRatingModal()">${t("common.close")}</button>
  `;
}

function renderPlayerRatingModalContent() {
  const intro = CURRENT_LANG === "en"
    ? "<b>NHLPRO Rating</b> is a custom index combining goals, assists, shots, power-play impact, current form and season stability."
    : "<b>NHLPRO Rating</b> je vlastný analytický index. Kombinuje góly, asistencie, strely, presilovky, formu aj dlhodobú výkonnosť hráča.";

  const prod = CURRENT_LANG === "en"
    ? ["Goals", "Assists", "Key goals have higher weight", "Power-play goals get a bonus"]
    : ["Góly", "Asistencie", "Dôležité góly majú vyššiu váhu", "Presilovkové góly majú bonus"];

  const off = CURRENT_LANG === "en"
    ? ["Shots", "Offensive involvement"]
    : ["Počet striel", "Útočná aktivita"];

  const spec = CURRENT_LANG === "en"
    ? ["Power-play impact (PP)", "Penalty kill (PK)", "Key moments"]
    : ["Výkon v presilovkách (PP)", "Oslabenia (PK)", "Kľúčové momenty zápasov"];

  const form = CURRENT_LANG === "en"
    ? "The rating reacts to recent games — rises quickly in good form and drops on weak performances."
    : "Rating sa mení podľa posledných zápasov – rýchlo rastie pri dobrej forme, klesá pri slabých výkonoch.";

  const stab = CURRENT_LANG === "en"
    ? "Season-long weighting is used so the rating doesn't swing based on a single game."
    : "Systém započítava celú sezónu, aby hodnotenie nekolísalo len podľa jedného zápasu.";

  return `
    <h2>${t("modal.player.title")}</h2>
    <p>${intro}</p>

    <h3>${CURRENT_LANG === "en" ? "🔥 1. Production" : "🔥 1. Produktivita"}</h3>
    <ul>${prod.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "🎯 2. Offensive activity" : "🎯 2. Ofenzívna aktivita"}</h3>
    <ul>${off.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "⚡ 3. Special teams" : "⚡ 3. Špeciálne formácie"}</h3>
    <ul>${spec.map((x) => `<li>${x}</li>`).join("")}</ul>

    <h3>${CURRENT_LANG === "en" ? "📈 4. Current form" : "📈 4. Aktuálna forma"}</h3>
    <p>${form}</p>

    <h3>${CURRENT_LANG === "en" ? "🎚️ 5. Season stability" : "🎚️ 5. Celosezónna stabilita"}</h3>
    <p>${stab}</p>

    <button class="close-modal-btn" onclick="closeRatingModal()">${t("common.close")}</button>
  `;
}

function renderPrivacy() {
  if (CURRENT_LANG === "en") {
    return `
      <h2>🔒 Privacy Policy - NHLPRO.sk</h2>
      <p><strong>Last updated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>

      <h3>1️⃣ Data Controller</h3>
      <p>The operator of NHLPRO.sk is responsible for the processing of personal data in accordance with GDPR (General Data Protection Regulation).</p>

      <h3>2️⃣ Personal Data We Collect</h3>
      <p>We collect the following personal data:</p>
      <ul>
        <li><strong>Registration data:</strong> Email address, password (encrypted)</li>
        <li><strong>Usage data:</strong> IP address, browser type, device information, pages visited, time spent on site</li>
        <li><strong>Analytics data:</strong> Data collected through Google Analytics (anonymized)</li>
        <li><strong>Premium service data:</strong> Selected players, betting strategies, preferences</li>
      </ul>

      <h3>3️⃣ Purpose of Data Processing</h3>
      <p>We process personal data for the following purposes:</p>
      <ul>
        <li>Providing and improving our services</li>
        <li>User account management</li>
        <li>Website analytics and statistics</li>
        <li>Communication with users</li>
        <li>Compliance with legal obligations</li>
      </ul>

      <h3>4️⃣ Legal Basis for Processing</h3>
      <p>We process personal data based on:</p>
      <ul>
        <li><strong>Consent:</strong> When you register or use our services</li>
        <li><strong>Legitimate interest:</strong> For website analytics and improvement</li>
        <li><strong>Contract performance:</strong> For premium services</li>
      </ul>

      <h3>5️⃣ Data Retention</h3>
      <p>We retain personal data only for as long as necessary for the purposes stated above, or as required by law. Account data is retained until account deletion.</p>

      <h3>6️⃣ Your Rights</h3>
      <p>Under GDPR, you have the right to:</p>
      <ul>
        <li>Access your personal data</li>
        <li>Rectify inaccurate data</li>
        <li>Request deletion of your data</li>
        <li>Object to processing</li>
        <li>Data portability</li>
        <li>Withdraw consent at any time</li>
      </ul>

      <h3>7️⃣ Data Security</h3>
      <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, loss, or destruction.</p>

      <h3>8️⃣ Cookies and Analytics</h3>
      <p>We use Google Analytics to analyze website usage. This service uses cookies and may collect anonymized data about your visit. You can opt-out through your browser settings.</p>

      <h3>9️⃣ Contact</h3>
      <p>For questions about data protection, please contact us through the website contact form or email.</p>

      <h3>🔟 Changes to Privacy Policy</h3>
      <p>We reserve the right to update this Privacy Policy. Changes will be published on this page.</p>
    `;
  }

  return `
    <h2>🔒 Ochrana osobných údajov - NHLPRO.sk</h2>
    <p><strong>Posledná aktualizácia:</strong> ${new Date().toLocaleDateString('sk-SK')}</p>

    <h3>1️⃣ Správca osobných údajov</h3>
    <p>Prevádzkovateľ webovej stránky NHLPRO.sk je zodpovedný za spracúvanie osobných údajov v súlade s nariadením GDPR (Všeobecné nariadenie o ochrane údajov).</p>

    <h3>2️⃣ Osobné údaje, ktoré zhromažďujeme</h3>
    <p>Zhromažďujeme nasledujúce osobné údaje:</p>
    <ul>
      <li><strong>Registračné údaje:</strong> Emailová adresa, heslo (zašifrované)</li>
      <li><strong>Údaje o používaní:</strong> IP adresa, typ prehliadača, informácie o zariadení, navštívené stránky, čas strávený na stránke</li>
      <li><strong>Analytické údaje:</strong> Údaje zhromažďované prostredníctvom Google Analytics (anonymizované)</li>
      <li><strong>Údaje o prémiových službách:</strong> Vybraní hráči, stávkové stratégie, preferencie</li>
    </ul>

    <h3>3️⃣ Účel spracúvania údajov</h3>
    <p>Spracúvame osobné údaje na nasledujúce účely:</p>
    <ul>
      <li>Poskytovanie a zlepšovanie našich služieb</li>
      <li>Správa používateľských účtov</li>
      <li>Analytika a štatistiky webovej stránky</li>
      <li>Komunikácia s používateľmi</li>
      <li>Splnenie zákonných povinností</li>
    </ul>

    <h3>4️⃣ Právny základ spracúvania</h3>
    <p>Spracúvame osobné údaje na základe:</p>
    <ul>
      <li><strong>Súhlasu:</strong> Pri registrácii alebo používaní našich služieb</li>
      <li><strong>Oprávneného záujmu:</strong> Pre analytiku a zlepšovanie webovej stránky</li>
      <li><strong>Vykonávania zmluvy:</strong> Pre prémiové služby</li>
    </ul>

    <h3>5️⃣ Uchovávanie údajov</h3>
    <p>Osobné údaje uchovávame len po dobu nevyhnutnú na účely uvedené vyššie, alebo podľa požiadaviek zákona. Údaje účtu sa uchovávajú do vymazania účtu.</p>

    <h3>6️⃣ Vaše práva</h3>
    <p>V súlade s GDPR máte právo na:</p>
    <ul>
      <li>Prístup k vašim osobným údajom</li>
      <li>Opravu nepresných údajov</li>
      <li>Vymazanie vašich údajov</li>
      <li>Námietku voči spracúvaniu</li>
      <li>Prenosnosť údajov</li>
      <li>Odvolanie súhlasu kedykoľvek</li>
    </ul>

    <h3>7️⃣ Bezpečnosť údajov</h3>
    <p>Implementujeme vhodné technické a organizačné opatrenia na ochranu vašich osobných údajov pred neoprávneným prístupom, stratou alebo zničením.</p>

    <h3>8️⃣ Cookies a analytika</h3>
    <p>Používame Google Analytics na analýzu používania webovej stránky. Táto služba používa cookies a môže zhromažďovať anonymizované údaje o vašej návšteve. Môžete sa odhlásiť prostredníctvom nastavení vášho prehliadača.</p>

    <h3>9️⃣ Kontakt</h3>
    <p>Pre otázky týkajúce sa ochrany údajov nás kontaktujte prostredníctvom kontaktného formulára na webovej stránke alebo emailu.</p>

    <h3>🔟 Zmeny v zásadách ochrany údajov</h3>
    <p>Vyhradzujeme si právo aktualizovať tieto zásady ochrany údajov. Zmeny budú zverejnené na tejto stránke.</p>
  `;
}

function renderTerms() {
  if (CURRENT_LANG === "en") {
    return `
      <h2>📋 Terms of Service - NHLPRO.sk</h2>
      <p><strong>Last updated:</strong> ${new Date().toLocaleDateString('en-GB')}</p>

      <h3>1️⃣ Acceptance of Terms</h3>
      <p>By accessing and using NHLPRO.sk, you accept and agree to be bound by these Terms of Service. If you do not agree, please do not use our services.</p>

      <h3>2️⃣ Description of Service</h3>
      <p>NHLPRO.sk provides informational, analytical, and educational content related to NHL hockey, including:</p>
      <ul>
        <li>Game statistics and results</li>
        <li>Player and team ratings</li>
        <li>Analytical models and betting strategies</li>
        <li>Premium services for registered users</li>
      </ul>

      <h3>3️⃣ User Accounts</h3>
      <p>To access certain features, you must create an account. You are responsible for:</p>
      <ul>
        <li>Maintaining the confidentiality of your account credentials</li>
        <li>All activities that occur under your account</li>
        <li>Notifying us immediately of any unauthorized use</li>
      </ul>

      <h3>4️⃣ Acceptable Use</h3>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service for illegal purposes</li>
        <li>Attempt to gain unauthorized access to the system</li>
        <li>Interfere with or disrupt the service</li>
        <li>Copy, modify, or distribute content without permission</li>
        <li>Use automated systems to access the service</li>
      </ul>

      <h3>5️⃣ Premium Services</h3>
      <p>Premium services are provided on a subscription basis. Terms include:</p>
      <ul>
        <li>Access to advanced features and analytics</li>
        <li>No guarantee of profit or betting success</li>
        <li>Refund policy as specified at time of purchase</li>
      </ul>

      <h3>6️⃣ Intellectual Property</h3>
      <p>All content on NHLPRO.sk, including text, graphics, logos, and software, is the property of NHLPRO.sk and protected by copyright laws.</p>

      <h3>7️⃣ Limitation of Liability</h3>
      <p>NHLPRO.sk is provided "as is" without warranties. We are not liable for:</p>
      <ul>
        <li>Any losses resulting from use of our information</li>
        <li>Service interruptions or errors</li>
        <li>Decisions made based on our content</li>
      </ul>

      <h3>8️⃣ Age Restriction</h3>
      <p>Our services are intended for users aged 18 and older. By using our service, you confirm that you meet this age requirement.</p>

      <h3>9️⃣ Modifications to Service</h3>
      <p>We reserve the right to modify, suspend, or discontinue any part of the service at any time without prior notice.</p>

      <h3>🔟 Termination</h3>
      <p>We may terminate or suspend your account and access to the service immediately, without prior notice, for any breach of these Terms.</p>

      <h3>1️⃣1️⃣ Governing Law</h3>
      <p>These Terms are governed by the laws of the Slovak Republic. Any disputes shall be resolved in Slovak courts.</p>

      <h3>1️⃣2️⃣ Contact</h3>
      <p>For questions about these Terms, please contact us through the website contact form.</p>
    `;
  }

  return `
    <h2>📋 Podmienky používania - NHLPRO.sk</h2>
    <p><strong>Posledná aktualizácia:</strong> ${new Date().toLocaleDateString('sk-SK')}</p>

    <h3>1️⃣ Prijatie podmienok</h3>
    <p>Prístupom a používaním NHLPRO.sk prijímate a súhlasíte s tým, že budete viazaní týmito Podmienkami používania. Ak nesúhlasíte, nepoužívajte naše služby.</p>

    <h3>2️⃣ Popis služby</h3>
    <p>NHLPRO.sk poskytuje informačný, analytický a vzdelávací obsah týkajúci sa NHL hokeja, vrátane:</p>
    <ul>
      <li>Štatistík a výsledkov zápasov</li>
      <li>Hodnotení hráčov a tímov</li>
      <li>Analytických modelov a stávkových stratégií</li>
      <li>Prémiových služieb pre registrovaných používateľov</li>
    </ul>

    <h3>3️⃣ Používateľské účty</h3>
    <p>Pre prístup k určitým funkciám musíte vytvoriť účet. Zodpovedáte za:</p>
    <ul>
      <li>Zachovanie dôvernosti vašich prihlasovacích údajov</li>
      <li>Všetky aktivity, ktoré sa vyskytnú pod vaším účtom</li>
      <li>Okamžité oznámenie o akomkoľvek neoprávnenom použití</li>
    </ul>

    <h3>4️⃣ Prípustné použitie</h3>
    <p>Súhlasíte, že nebudete:</p>
    <ul>
      <li>Používať službu na nezákonné účely</li>
      <li>Pokúšať sa získať neoprávnený prístup k systému</li>
      <li>Narušovať alebo narúšať službu</li>
      <li>Kopírovať, upravovať alebo distribuovať obsah bez povolenia</li>
      <li>Používať automatizované systémy na prístup k službe</li>
    </ul>

    <h3>5️⃣ Prémiové služby</h3>
    <p>Prémiové služby sú poskytované na základe predplatného. Podmienky zahŕňajú:</p>
    <ul>
      <li>Prístup k pokročilým funkciám a analýzam</li>
      <li>Žiadnu záruku zisku alebo úspechu v stávkovaní</li>
      <li>Politiku vrátenia peňazí podľa špecifikácie v čase nákupu</li>
    </ul>

    <h3>6️⃣ Duševné vlastníctvo</h3>
    <p>Všetok obsah na NHLPRO.sk, vrátane textu, grafiky, loga a softvéru, je vlastníctvom NHLPRO.sk a je chránený autorským právom.</p>

    <h3>7️⃣ Obmedzenie zodpovednosti</h3>
    <p>NHLPRO.sk je poskytovaný "tak, ako je" bez záruk. Nezodpovedáme za:</p>
    <ul>
      <li>Žiadne straty vyplývajúce z použitia našich informácií</li>
      <li>Prerušenia služby alebo chyby</li>
      <li>Rozhodnutia založené na našom obsahu</li>
    </ul>

    <h3>8️⃣ Vekové obmedzenie</h3>
    <p>Naše služby sú určené pre používateľov vo veku 18 a viac rokov. Používaním našej služby potvrdzujete, že spĺňate túto vekovú požiadavku.</p>

    <h3>9️⃣ Úpravy služby</h3>
    <p>Vyhradzujeme si právo kedykoľvek upraviť, pozastaviť alebo ukončiť akúkoľvek časť služby bez predchádzajúceho upozornenia.</p>

    <h3>🔟 Ukončenie</h3>
    <p>Môžeme okamžite ukončiť alebo pozastaviť váš účet a prístup k službe bez predchádzajúceho upozornenia za akékoľvek porušenie týchto Podmienok.</p>

    <h3>1️⃣1️⃣ Právny poriadok</h3>
    <p>Tieto Podmienky sa riadia právnymi predpismi Slovenskej republiky. Akékoľvek spory sa riešia v slovenských súdoch.</p>

    <h3>1️⃣2️⃣ Kontakt</h3>
    <p>Pre otázky týkajúce sa týchto Podmienok nás kontaktujte prostredníctvom kontaktného formulára na webovej stránke.</p>
  `;
}

function renderAbsInfoBox() {
  return `
    <h2>${t("abs.title")}</h2>
    <div class="abs-content-text">
      <div class="abs-content-box">
        <p>${t("abs.intro")}</p>
      </div>
      <div class="abs-content-box">
        <p>${t("abs.more1")}</p>
      </div>
      <div class="abs-content-box">
        <p>${t("abs.more2")}</p>
      </div>
    </div>
    <div class="abs-warning">${t("abs.warn")}</div>
  `;
}

function renderDisclaimer() {
  if (CURRENT_LANG === "en") {
    return `
      <h2>${t("disclaimer.title")}</h2>
      <h3>1️⃣ General notice</h3>
      <p><strong>NHLPRO.sk</strong> is for informational, analytical and educational purposes only. The content is not betting advice, investment advice, or a solicitation to place bets.</p>
      <p>All information, statistics, models, ratings and strategies are provided without any guarantee of success or profit.</p>

      <h3>2️⃣ Risk and user responsibility</h3>
      <p>Betting and gambling involve financial risk and may lead to loss of money. You use the information on this website at your own risk.</p>
      <p>The operator is not responsible for any financial losses resulting from the use of information, strategies or tools provided on the website.</p>

      <h3>3️⃣ Advanced betting strategy and analytical models</h3>
      <p>Strategies and models are not a guaranteed way to make profit. They are theoretical and analytical approaches.</p>
      <p>Past results are not a guarantee of future results.</p>

      <h3>4️⃣ Data transparency</h3>
      <p>NHLPRO.sk publishes complete historical data (including wins, losses and skipped games) for transparency and analysis purposes.</p>

      <h3>5️⃣ Independence from bookmakers</h3>
      <p>NHLPRO.sk is not a bookmaker and does not accept bets or deposits.</p>

      <h3>6️⃣ Age restriction</h3>
      <p>This website is intended for users aged 18+ only.</p>

      <h3>7️⃣ VIP / Premium services</h3>
      <p>Purchasing VIP/Premium does not provide any guarantee of profit or personal betting advice.</p>

      <h3>8️⃣ Final provisions</h3>
      <p>By using NHLPRO.sk you agree to this legal disclaimer. If you do not agree, any use of the nhlpro.sk web portal is prohibited.</p>
    `;
  }

  return `
    <h2>${t("disclaimer.title")}</h2>
    <h3>1️⃣ Všeobecné upozornenie</h3>
    <p>Webová stránka <strong>NHLPRO.sk</strong> slúži výhradne na informačné, analytické a vzdelávacie účely. Obsah stránky nepredstavuje stávkové poradenstvo, investičné odporúčanie ani výzvu na uzatváranie stávok.</p>
    <p>Používateľ berie na vedomie, že všetky informácie, štatistiky, modely, hodnotenia a stratégie zverejnené na stránke sú poskytované bez akejkoľvek záruky úspechu alebo zisku.</p>

    <h3>2️⃣ Riziko a zodpovednosť používateľa</h3>
    <p>Stávkovanie a hazardné hry sú spojené s finančným rizikom a môžu viesť k strate peňazí. Používateľ používa informácie zverejnené na stránke výlučne na vlastnú zodpovednosť.</p>
    <p>Prevádzkovateľ stránky nezodpovedá za žiadne finančné straty, ktoré môžu vzniknúť v dôsledku použitia informácií, stratégií alebo nástrojov dostupných na stránke.</p>

    <h3>3️⃣ Advanced betting strategy a analytické modely</h3>
    <p>Stratégie a modely (vrátane tzv. Pokročilej stávkovej stratégie) nepredstavujú zaručený spôsob dosahovania zisku. Ide o teoretické a analytické prístupy.</p>
    <p>Minulé výsledky nie sú zárukou budúcich výsledkov.</p>

    <h3>4️⃣ Transparentnosť údajov</h3>
    <p>NHLPRO.sk zverejňuje kompletné historické údaje vrátane výhier, prehier a vynechaných zápasov. Tieto údaje slúžia výhradne na prehľad a analýzu.</p>

    <h3>5️⃣ Nezávislosť od stávkových kancelárií</h3>
    <p>NHLPRO.sk nie je stávkovou kanceláriou a neprijíma stávky ani finančné vklady.</p>

    <h3>6️⃣ Vekové obmedzenie</h3>
    <p>Používanie stránky je určené výhradne osobám starším ako 18 rokov.</p>

    <h3>7️⃣ VIP / Premium služby</h3>
    <p>Zakúpením VIP služby používateľ nezískava žiadnu záruku zisku ani osobné stávkové poradenstvo.</p>

    <h3>8️⃣ Záverečné ustanovenia</h3>
    <p>Používaním stránky NHLPRO.sk používateľ vyjadruje súhlas s týmto právnym upozornením. Ak s podmienkami používania nesúhlasí, je zakázané akékoľvek používanie web portálu nhlpro.sk!</p>
  `;
}

function applyI18n() {
  applyStaticI18n();

  // Render long blocks
  const teamModal = document.getElementById("teamRatingModalContent");
  if (teamModal) teamModal.innerHTML = renderTeamRatingModalContent();

  const playerModal = document.getElementById("playerRatingModalContent");
  if (playerModal) playerModal.innerHTML = renderPlayerRatingModalContent();

  const abs = document.getElementById("absInfoBox");
  if (abs) abs.innerHTML = renderAbsInfoBox();

  const disc = document.getElementById("disclaimerContent");
  if (disc) disc.innerHTML = renderDisclaimer();

  const privacy = document.getElementById("privacyContent");
  if (privacy) privacy.innerHTML = renderPrivacy();

  const terms = document.getElementById("termsContent");
  if (terms) terms.innerHTML = renderTerms();

  // Update mobile select <option> labels too
  document.querySelectorAll("#mobileSelect option[data-i18n]").forEach((opt) => {
    const key = opt.getAttribute("data-i18n");
    if (key) opt.textContent = t(key);
  });
}

function setLanguage(lang) {
  const next = String(lang || "").toLowerCase();
  if (!["sk", "en"].includes(next)) return;
  CURRENT_LANG = next;
  localStorage.setItem("nhlpro_lang", next);
  applyI18n();

  // refresh visible section content (dynamic strings)
  const visible = Array.from(document.querySelectorAll(".section, .content-section"))
    .find((el) => el && el.style.display !== "none");
  if (visible?.id && typeof window.showSection === "function") {
    window.showSection(visible.id);
  }
}

function syncLangButtonsUI() {
  const skBtn = document.getElementById("langBtnSk");
  const enBtn = document.getElementById("langBtnEn");
  skBtn?.classList.toggle("is-active", CURRENT_LANG === "sk");
  enBtn?.classList.toggle("is-active", CURRENT_LANG === "en");
}

// CTA from ABS → open Premium registration safely
function openAbsRegisterCta() {
  try {
    if (typeof window.showSection === "function") {
      window.showSection("premium-section");
    } else {
      document.getElementById("premium-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const token = localStorage.getItem("sb-access-token");
    if (token) {
      // if already logged in, just refresh Premium UI
      if (typeof window.checkPremiumStatus === "function") {
        window.checkPremiumStatus();
      }
      return;
    }

    // show register box
    if (typeof window.hideAllPremiumUI === "function") {
      window.hideAllPremiumUI();
    } else {
      ["premium-not-logged", "premium-register-box", "premium-locked", "premium-content"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
    }

    const box = document.getElementById("premium-register-box");
    if (box) {
      box.style.display = "block";
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (e) {
    console.error("openAbsRegisterCta failed:", e);
  }
}

// expose for inline onclick
window.openAbsRegisterCta = openAbsRegisterCta;

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
    <p style="text-align:center;color:#00eaff;">${t("home.loading")}</p>
  `;

  try {
    // 🔥 1️⃣ RÝCHLE API – len zápasy, štatistiky, AI história a ABS zisk
    const [homeResp, statsResp, aiGetResp, absResp] = await Promise.all([
      fetch("/api/home", { cache: "no-store" }),
      fetch("/api/statistics", { cache: "no-store" }),
      fetch("/api/ai?task=get", { cache: "no-store" }),
      fetch("/api/mantingal?task=all", { cache: "no-store" })
    ]);

    const homeData = await homeResp.json();
    const statsData = statsResp.ok ? await statsResp.json() : {};

    // AI história (bez dnešného live výpočtu)
    const aiData = aiGetResp.ok
      ? await aiGetResp.json()
      : { history: [], hits: 0, total: 0, successRate: 0 };

    const history = (aiData.history || []).filter(h => h.result !== "pending");

    // ABS zisk
    const absData = absResp.ok ? await absResp.json() : { totalProfit: 0, players: {} };
    const absTotalProfit = absData.totalProfit || 0;
    const absPlayerCount = Object.keys(absData.players || {}).length;

    // 🔝 Štatistiky hráčov
    const topGoal = statsData?.topGoals?.[0] || {};
    const topPoints = statsData?.topPoints?.[0] || {};
    const topShots = statsData?.topShots?.[0] || {};

    // 🔥 2️⃣ VŠETKO OKREM AI TIPU SA RENDERUJE HNEĎ
    const gamesCountText = t("home.gamesCount", { count: homeData.matchesToday.length });
    
    let html = `
<section class="nhl-home">

  <!-- ================= HERO BANNER ================= -->
  <div class="hero-banner">
    <div class="hero-content">
      <h1 class="hero-title">${t("home.heroTitle")}</h1>
      <p class="hero-subtitle">${t("home.heroSubtitle")}</p>
      <div class="hero-cta">
        <button class="hero-btn-primary" onclick="showSection('premium-section')">
          ${t("home.ctaStart")}
        </button>
        <button class="hero-btn-secondary" onclick="showSection('mantingale-section')">
          ${t("home.ctaLearn")}
        </button>
      </div>
    </div>
    <div class="hero-stats">
      <div class="hero-stat-item">
        <div class="hero-stat-value">${absTotalProfit.toFixed(2)} €</div>
        <div class="hero-stat-label">${t("home.statTotalProfit")}</div>
      </div>
      <div class="hero-stat-item">
        <div class="hero-stat-value">${absPlayerCount}</div>
        <div class="hero-stat-label">${t("home.statTotalPlayers")}</div>
      </div>
      <div class="hero-stat-item">
        <div class="hero-stat-value">ABS</div>
        <div class="hero-stat-label">${t("home.statStrategy")}</div>
      </div>
    </div>
  </div>

  <!-- ================= HERO GRID ================= -->
  <div class="nhl-hero-grid">

    <!-- DNESNE ZAPASY -->
    <div class="nhl-card">
      <div class="nhl-card-head">
        <h3>${t("home.todaysGames")}</h3>
        <span class="nhl-card-hint">${gamesCountText}</span>
      </div>

      <div class="nhl-games-list">
        ${
          homeData.matchesToday.length === 0
            ? `<p class="nhl-muted">${t("home.noGamesToday")}</p>`
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
        ${t("home.viewAll")}
      </button>
    </div>

    <!-- AI STRELEC DNA -->
    <div class="nhl-card nhl-ai-card">
      <div class="nhl-card-head">
        <h3>${t("home.aiScorer")}</h3>
      </div>

      <div id="ai-today-loading" class="nhl-ai-center">
        <p class="nhl-muted">${t("home.aiLoading")}</p>
      </div>
    </div>

    <!-- HISTORIA AI -->
    <div class="nhl-card">
      <div class="nhl-card-head">
        <h3>${t("home.aiHistory")}</h3>
      </div>

      <div class="nhl-ai-history">
        ${
          history.length === 0
            ? `<p class="nhl-muted">${t("home.noTips")}</p>`
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
    <h2>${t("home.topStats")}</h2>
    <button class="nhl-btn nhl-btn-ghost" onclick="showSection('stats-section')">
      ${t("home.viewAllStats")}
    </button>
  </div>

  <div class="nhl-stats-grid">

  <div class="top-player">
    <img src="${topGoal.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topGoal.name || "-"}</b><br>
      🥅 ${t("home.statGoals", { n: (topGoal.goals || 0) })}
    </div>
    <span class="stat-label">${t("home.topGoals")}</span>
  </div>

  <div class="top-player">
    <img src="${statsData?.topAssists?.[0]?.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${statsData?.topAssists?.[0]?.name || "-"}</b><br>
      🅰️ ${t("home.statAssists", { n: (statsData?.topAssists?.[0]?.assists || 0) })}
    </div>
    <span class="stat-label">${t("home.topAssists")}</span>
  </div>

  <div class="top-player">
    <img src="${topPoints.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topPoints.name || "-"}</b><br>
      ⚡ ${t("home.statPoints", { n: (topPoints.points || 0) })}
    </div>
    <span class="stat-label">${t("home.topPoints")}</span>
  </div>

  <div class="top-player">
    <img src="${statsData?.topPowerPlayGoals?.[0]?.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${statsData?.topPowerPlayGoals?.[0]?.name || "-"}</b><br>
      🔌 ${statsData?.topPowerPlayGoals?.[0]?.powerPlayGoals || 0} ${CURRENT_LANG === "en" ? "PP goals" : "PP gólov"}
    </div>
    <span class="stat-label">${t("home.topPP")}</span>
  </div>

  <div class="top-player">
    <img src="${topShots.headshot || "/icons/nhl_placeholder.svg"}">
    <div>
      <b>${topShots.name || "-"}</b><br>
      🎯 ${t("home.statShots", { n: (topShots.shots || 0) })}
    </div>
    <span class="stat-label">${t("home.topShots")}</span>
  </div>

</div>

  <!-- ================= FEATURES SECTION ================= -->
  <div class="features-section">
    <h2 class="features-title">${t("home.featuresTitle")}</h2>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon">🤖</div>
        <h3 class="feature-heading">${t("home.featureAI")}</h3>
        <p class="feature-text">${t("home.featureAIDesc")}</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <h3 class="feature-heading">${t("home.featureStats")}</h3>
        <p class="feature-text">${t("home.featureStatsDesc")}</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <h3 class="feature-heading">${t("home.featureStrategy")}</h3>
        <p class="feature-text">${t("home.featureStrategyDesc")}</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🎯</div>
        <h3 class="feature-heading">${t("home.featureRealTime")}</h3>
        <p class="feature-text">${t("home.featureRealTimeDesc")}</p>
      </div>
    </div>
    <div class="features-cta">
      <button class="feature-cta-btn" onclick="showSection('premium-section')">
        ${t("home.featureCTA")}
      </button>
    </div>
  </div>

</section>
`;

home.innerHTML = html;

    // 🎬 Aplikuj animácie na nové elementy
    setTimeout(() => {
      animateNewElements(home);
    }, 50);

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
          box.innerHTML = `<p style="color:#aaa;">${t("home.aiFailed")}</p>`;
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
    statusEl.textContent = t("matches.loading");
  }

  try {
    const response = await fetch(`${API_BASE}/api/matches`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("❌ Server vrátil chybu:", txt);
      if (statusEl) {
        statusEl.textContent = t("matches.serverError");
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
      statusEl.textContent = t("matches.done", { games: totalGames, players: totalPlayers });
    }

    // === ZÁPASY ===
    allMatches = Array.isArray(data.matches) ? data.matches : [];

    if (!allMatches.length) {
      console.warn("⚠️ Žiadne zápasy v data.matches");
      if (statusEl) {
        statusEl.textContent = t("matches.noGames");
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
      LAST_STANDINGS = data.standings;
      renderStandings(data.standings);
    } else {
      console.warn("⚠️ Standings nie sú v odpovedi backendu");
    }

  } catch (err) {
    console.error("❌ Chyba pri načítaní zápasov:", err);
    if (statusEl) {
      statusEl.textContent = t("matches.serverError");
    }
  }
}

let matchesExpanded = false; // globálny flag pre Zobraziť viac

// HTML uses onclick="toggleMoreMatches()"
function toggleMoreMatches() {
  matchesExpanded = !matchesExpanded;
  if (Array.isArray(allMatches) && allMatches.length) {
    displayMatches(allMatches);
  }
}

// === Zápasy ===
async function displayMatches(matches) {
  const recentBox = document.getElementById("matches-recent");
  const olderBox  = document.getElementById("matches-older");
  const moreBtn   = document.getElementById("matches-more-btn");

  if (!recentBox || !olderBox) return;

  recentBox.innerHTML = "";
  olderBox.innerHTML  = "";

  if (!matches || matches.length === 0) {
    recentBox.innerHTML = `<p class="nhl-muted">${t("matches.noFinished")}</p>`;
    if (moreBtn) moreBtn.style.display = "none";
    return;
  }

  // ===============================
  // MAPA NÁZOV → SKRATKA
  // ===============================
  const TEAM_NAME_TO_ABBREV = {
    "Maple Leafs":"TOR","Penguins":"PIT","Red Wings":"DET","Stars":"DAL",
    "Capitals":"WSH","Rangers":"NYR","Bruins":"BOS","Canadiens":"MTL",
    "Senators":"OTT","Sabres":"BUF","Islanders":"NYI","Devils":"NJD",
    "Hurricanes":"CAR","Panthers":"FLA","Wild":"MIN","Predators":"NSH",
    "Blackhawks":"CHI","Flyers":"PHI","Avalanche":"COL","Oilers":"EDM",
    "Flames":"CGY","Golden Knights":"VGK","Kings":"LAK","Kraken":"SEA",
    "Sharks":"SJS","Ducks":"ANA","Lightning":"TBL","Jets":"WPG",
    "Coyotes":"ARI","Blues":"STL","Blue Jackets":"CBJ",
    "Mammoth":"UTA","Canucks":"VAN"
  };

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

      const homeAbbr = TEAM_NAME_TO_ABBREV[home] || home.slice(0,3).toUpperCase();
      const awayAbbr = TEAM_NAME_TO_ABBREV[away] || away.slice(0,3).toUpperCase();

      const homeLogo = TEAM_NAME_TO_ABBREV[home]
        ? `https://assets.nhle.com/logos/nhl/svg/${homeAbbr}_light.svg`
        : "";

      const awayLogo = TEAM_NAME_TO_ABBREV[away]
        ? `https://assets.nhle.com/logos/nhl/svg/${awayAbbr}_light.svg`
        : "";

      dayHtml += `
        <div class="score-row">

          <div class="team team-left">
            ${homeLogo ? `<img src="${homeLogo}" class="team-logo" alt="${home}">` : ""}
            <span class="team-name">${homeAbbr}</span>
          </div>

          <div class="score-center">
            <span class="score ${homeWin ? "win" : ""}">${hs}</span>
            <span class="sep">:</span>
            <span class="score ${awayWin ? "win" : ""}">${as}</span>
          </div>

          <div class="team team-right">
            <span class="team-name">${awayAbbr}</span>
            ${awayLogo ? `<img src="${awayLogo}" class="team-logo" alt="${away}">` : ""}
            <div id="${recapId}" class="highlight-slot"></div>
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
        moreBtn.textContent = t("matches.more");
      } else {
        olderBox.classList.remove("hidden");
        moreBtn.textContent = t("matches.less");
      }
    } else {
      moreBtn.style.display = "none";
    }
  }

  // ===============================
  // 🎥 Zostrihy – BEZ ZMENY LOGIKY
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

// === Tabuľka NHL – zjednodušená (prehľadná) ===
function renderStandings(standings) {
  const box = document.getElementById("standings-table");
  if (!box) return;

  if (!Array.isArray(standings) || standings.length === 0) {
    box.innerHTML = `<p class="nhl-muted">${t("matches.standingsUnavailable")}</p>`;
    return;
  }

  const rows = standings
    .slice()
    .sort((a, b) => b.points - a.points);

  box.innerHTML = `
    <table class="standings-table wide">
      <thead>
        <tr>
          <th>#</th>
          <th>Tím</th>
          <th>GP</th>
          <th>W</th>
          <th>L</th>
          <th class="pts">PTS</th>
          <th>GF</th>
          <th>GA</th>
          <th>+/-</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((t, i) => {
          const GP = t.gamesPlayed ?? 0;
          const W  = t.wins ?? 0;

          // L = regulárne prehry + OT/SO prehry
          const L  = (t.losses ?? 0) + (t.otLosses ?? 0);

          const GF = t.goalFor ?? 0;
          const GA = t.goalAgainst ?? 0;
          const DIFF = t.goalDifferential ?? (GF - GA);

          return `
            <tr>
              <td>${i + 1}</td>

              <td class="team-cell">
                <img src="${t.teamLogo}" alt="${t.teamName?.default || ""}">
                <span>${t.teamName?.default || ""}</span>
              </td>

              <td>${GP}</td>
              <td>${W}</td>
              <td>${L}</td>

              <td class="pts">${t.points}</td>

              <td>${GF}</td>
              <td>${GA}</td>

              <td class="${DIFF >= 0 ? "pos" : "neg"}">
                ${DIFF > 0 ? "+" : ""}${DIFF}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

     // 👑 PREMIUM – analytické boxy (L10)
     renderPremiumAnalytics(standings);
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
      if (last && p.team) {
        // Extrahuj len posledné slovo z názvu tímu (napr. "Anaheim Ducks" -> "Ducks")
        const teamParts = String(p.team).trim().split(/\s+/);
        const teamShort = teamParts.length > 0 ? teamParts[teamParts.length - 1] : p.team;
        acc[last] = teamShort;
      }
      return acc;
    }, {});

    console.log("✅ Načítané tímy pre hráčov:", Object.keys(playerTeams).length);
    // Debug: vypíš prvých 5 príkladov
    const sampleKeys = Object.keys(playerTeams).slice(0, 5);
    console.log("📋 Príklady playerTeams:", sampleKeys.map(k => `${k} -> ${playerTeams[k]}`));
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

// PRIVACY POLICY MODAL
document.getElementById("open-privacy")
  ?.addEventListener("click", () => {
    document
      .getElementById("privacy-modal")
      .classList.remove("hidden");
  });

document.getElementById("close-privacy")
  ?.addEventListener("click", () => {
    document
      .getElementById("privacy-modal")
      .classList.add("hidden");
  });

// TERMS OF SERVICE MODAL
document.getElementById("open-terms")
  ?.addEventListener("click", () => {
    document
      .getElementById("terms-modal")
      .classList.remove("hidden");
  });

document.getElementById("close-terms")
  ?.addEventListener("click", () => {
    document
      .getElementById("terms-modal")
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

// === ABS sekcia ===
async function loadMantingal() {
  // Zabezpeč, že playerTeams je načítaný
  if (!playerTeams || Object.keys(playerTeams).length === 0) {
    await loadPlayerTeams();
  }
  
  const res = await fetch("/api/mantingal?task=all");
  const data = await res.json();
  if (!data.ok) return;

  document.getElementById("mtg-total-profit").textContent =
    data.totalProfit.toFixed(2);

  const tbody = document.getElementById("mantingale-table-body");
  tbody.innerHTML = "";

  // Detekcia mobile zariadenia
  const isMobile = window.innerWidth <= 768;
  
  // Zoradiť hráčov podľa balance (od najvyššieho po najnižší)
  const sortedPlayers = Object.entries(data.players).sort((a, b) => {
    const balanceA = Number(a[1].balance || 0);
    const balanceB = Number(b[1].balance || 0);
    return balanceB - balanceA; // descending order
  });
  
  sortedPlayers.forEach(([name, p]) => {
    const tr = document.createElement("tr");
    // Skús nájsť tím - najprv v playerTeams, potom v premium cache
    let teamAbbrev = getPlayerTeamAbbrev(name, false);
    
    // Ak sa nenašiel, skús aj s premium cache
    if (!teamAbbrev) {
      teamAbbrev = getPlayerTeamAbbrev(name, true);
    }
    
    // Debug log pre prvých 3 hráčov
    if (Object.keys(data.players).indexOf(name) < 3) {
      const lastName = name.trim().split(/\s+/).pop().toLowerCase().replace(/[.,]/g, '');
      console.log(`🔍 Hráč: "${name}" -> Priezvisko: "${lastName}" -> Tím: "${teamAbbrev || 'NENAŠIEL'}"`);
      console.log(`   playerTeams["${lastName}"] = "${playerTeams[lastName] || 'NENÁJDENÉ'}"`);
      
      // Skús nájsť podobné kľúče
      const similarKeys = Object.keys(playerTeams).filter(k => 
        k.includes(lastName) || lastName.includes(k)
      ).slice(0, 5);
      console.log(`   Podobné kľúče v playerTeams:`, similarKeys);
      
      console.log(`   playerTeams keys: ${Object.keys(playerTeams).length}, premium cache: ${PREMIUM_PLAYERS_CACHE?.length || 0}`);
    }
    
    const playerDisplay = teamAbbrev ? `${name} <span style="color:#999; font-size:0.9em;">(${teamAbbrev})</span>` : name;

    // V mobile: Hráč | Balance | Stávka | Streak | ROI | Detail
    // V desktop: Hráč | Stávka | Streak | Balance | ROI | Detail
    if (isMobile) {
      tr.innerHTML = `
        <td class="player-cell">${playerDisplay}</td>
        <td class="balance balance-mobile-first">${p.balance.toFixed(2)}</td>
        <td>${p.stake}</td>
        <td>${p.streak}</td>
        <td class="roi roi-mobile" data-player="${name}">-</td>
        <td><button class="mtg-detail-btn" data-player="${name}">Detail</button></td>
      `;
    } else {
      tr.innerHTML = `
        <td class="player-cell">${playerDisplay}</td>
        <td>${p.stake}</td>
        <td>${p.streak}</td>
        <td class="balance">${p.balance.toFixed(2)}</td>
        <td class="roi roi-desktop" data-player="${name}">-</td>
        <td><button class="mtg-detail-btn" data-player="${name}">Detail</button></td>
      `;
    }

    tbody.appendChild(tr);
  });

  // Asynchrónne načítanie ROI pre všetkých hráčov
  sortedPlayers.forEach(async ([name, p]) => {
    try {
      const histRes = await fetch(`/api/mantingal?player=${encodeURIComponent(name)}`);
      const histData = await histRes.json();
      if (!histData.ok || !histData.history) return;

      // Vypočítaj celkovú investovanú sumu (súčet všetkých stávok)
      // Pri "miss" (prehre): stake = -profitChange (pretože profitChange je záporný)
      // Pri "hit" (výhre): nemáme priamo stake, ale vieme že profitChange = stake * (odds - 1)
      // Pre jednoduchosť použijeme len miss stávky pre výpočet totalStaked
      // a aproximáciu: totalStaked ≈ súčet abs(profitChange) z miss + počet hit stávok * priemerná stake
      let totalStaked = 0;
      let missCount = 0;
      let hitCount = 0;
      
      histData.history.forEach(h => {
        if (h.result === "miss" && h.profitChange) {
          // Pri prehre: stake = -profitChange (profitChange je záporný)
          totalStaked += Math.abs(Number(h.profitChange));
          missCount++;
        } else if (h.result === "hit" || h.result === "win") {
          hitCount++;
        }
      });

      // Ak máme aj hit stávky, aproximujeme ich stake ako priemer miss stávok
      // Alebo použijeme base stake 1€ (ak nemáme žiadne miss)
      if (missCount === 0 && hitCount > 0) {
        totalStaked = hitCount * 1; // base stake
      } else if (missCount > 0 && hitCount > 0) {
        const avgMissStake = totalStaked / missCount;
        totalStaked += hitCount * avgMissStake;
      }

      // Vypočítaj ROI: (Balance / Total Staked) * 100
      const balance = Number(p.balance || 0);
      let roi = 0;
      if (totalStaked > 0) {
        roi = (balance / totalStaked) * 100;
      }

      // Aktualizuj ROI v tabuľke
      const roiCells = document.querySelectorAll(`.roi[data-player="${name.replace(/"/g, '\\"')}"]`);
      roiCells.forEach(cell => {
        cell.textContent = roi.toFixed(1) + "%";
        if (roi > 0) {
          cell.classList.add("roi-positive");
        } else if (roi < 0) {
          cell.classList.add("roi-negative");
        }
      });
    } catch (err) {
      console.error(`Error calculating ROI for ${name}:`, err);
    }
  });

  // 🎨 Zafarbenie balance (plus / mínus)
tbody.querySelectorAll("td.balance").forEach(td => {
  const value = parseFloat(td.textContent.replace(",", "."));
  if (isNaN(value)) return;

  if (value > 0) td.classList.add("balance-plus");
  else if (value < 0) td.classList.add("balance-minus");
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

// Funkcia na konverziu gameId na formát "HOME-AWAY"
function formatGameId(gameId) {
  if (!gameId) return "-";
  
  // Nájdi zápas v allMatches podľa ID
  const match = allMatches.find(m => {
    const matchId = m.id || m.sport_event?.id;
    return String(matchId) === String(gameId);
  });
  
  if (!match) {
    // Ak sa zápas nenašiel, skús ešte raz s rôznymi formátmi
    console.warn(`Zápas s ID ${gameId} sa nenašiel v allMatches`);
    return gameId;
  }
  
  // Získaj názvy tímov - podporujeme rôzne formáty
  let homeTeam = "";
  let awayTeam = "";
  
  if (match.sport_event?.competitors && match.sport_event.competitors.length >= 2) {
    homeTeam = match.sport_event.competitors[0]?.name || "";
    awayTeam = match.sport_event.competitors[1]?.name || "";
  } else if (match.home_team && match.away_team) {
    homeTeam = match.home_team;
    awayTeam = match.away_team;
  }
  
  if (!homeTeam || !awayTeam) {
    console.warn(`Nepodarilo sa získať tímy pre zápas ${gameId}`);
    return gameId;
  }
  
  // Konvertuj na abbreviatúry
  const TEAM_NAME_TO_ABBREV = {
    "Maple Leafs":"TOR","Penguins":"PIT","Red Wings":"DET","Stars":"DAL",
    "Capitals":"WSH","Rangers":"NYR","Bruins":"BOS","Canadiens":"MTL",
    "Senators":"OTT","Sabres":"BUF","Islanders":"NYI","Devils":"NJD",
    "Hurricanes":"CAR","Panthers":"FLA","Wild":"MIN","Predators":"NSH",
    "Blackhawks":"CHI","Flyers":"PHI","Avalanche":"COL","Oilers":"EDM",
    "Flames":"CGY","Golden Knights":"VGK","Kings":"LAK","Kraken":"SEA",
    "Sharks":"SJS","Ducks":"ANA","Lightning":"TBL","Jets":"WPG",
    "Coyotes":"ARI","Blues":"STL","Blue Jackets":"CBJ",
    "Mammoth":"UTA","Canucks":"VAN"
  };
  
  const homeAbbr = TEAM_NAME_TO_ABBREV[homeTeam] || homeTeam.slice(0, 3).toUpperCase();
  const awayAbbr = TEAM_NAME_TO_ABBREV[awayTeam] || awayTeam.slice(0, 3).toUpperCase();
  
  return `${homeAbbr}-${awayAbbr}`;
}

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
    const gameDisplay = formatGameId(h.gameId);
    tbody.innerHTML += `
      <tr>
        <td>${h.date}</td>
        <td>${gameDisplay}</td>
        <td>${h.goals === null ? "-" : h.goals}</td>
        <td>${h.result}</td>
        <td>${h.profitChange}</td>
        <td class="balance">${h.balanceAfter}</td>
      </tr>
    `;
  });

  // 🎨 Zafarbenie balance (plus / mínus)
tbody.querySelectorAll("td.balance").forEach(td => {
  const value = parseFloat(td.textContent.replace(",", "."));
  if (isNaN(value)) return;

  if (value > 0) td.classList.add("balance-plus");
  else if (value < 0) td.classList.add("balance-minus");
});

  const detailBox = document.getElementById("mantingale-detail");
  detailBox.classList.remove("hidden");

  // ✅ AUTO SCROLL NA DETAIL
  detailBox.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// === ABS sekcia (nová verzia) ===
async function displayMantingal() {
  const container = document.getElementById("mantingal-container");
  if (!container) return;

  container.innerHTML = `<h2>${t("mantingale.title")}</h2><p>${t("mantingale.loadingData")}</p>`;

  try {
    const resp = await fetch("/api/mantingal", { cache: "no-store" });
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.players)) {
      container.innerHTML = `<p>${t("mantingale.loadFailed")}</p>`;
      return;
    }

    const { players, dateChecked, totalGames, scorers } = data;
    // 🔹 Spočítaj sumár ABS dňa
    const totalBets = players.length; // každý hráč = 1 stávka
    const totalProfit = players.reduce((sum, p) => sum + p.profit, 0);
    const roi = ((totalProfit / (totalBets * 1)) * 100).toFixed(1); // ak je base stake 1€

    // Info o spracovaní
    const lblDate = CURRENT_LANG === "en" ? "Date" : "Dátum";
    const lblGames = CURRENT_LANG === "en" ? "Games" : "Počet zápasov";
    const lblScorers = CURRENT_LANG === "en" ? "Scorers" : "Počet strelcov";
    const lblBets = CURRENT_LANG === "en" ? "Bets" : "Počet stávok";
    const lblProfit = CURRENT_LANG === "en" ? "Total profit" : "Celkový zisk";
    const lblRoi = "ROI";

    let html = `
      <h2>${t("mantingale.title")}</h2>
      <p><b>${lblDate}:</b> ${dateChecked}</p>
      <p><b>${lblGames}:</b> ${totalGames}</p>
      <p><b>${lblScorers}:</b> ${scorers}</p>
      <p><b>${lblBets}:</b> ${totalBets}</p>
      <p><b>${lblProfit}:</b> <span style="color:${totalProfit >= 0 ? "limegreen" : "red"}">
        ${totalProfit.toFixed(2)} €
      </span></p>
      <p><b>${lblRoi}:</b> <span style="color:${roi >= 0 ? "limegreen" : "red"}">${roi}%</span></p>
      <table>
        <thead>
          <tr>
            <th>${t("table.player")}</th>
            <th>${CURRENT_LANG === "en" ? "Stake (€)" : "Stávka (€)"}</th>
            <th>${CURRENT_LANG === "en" ? "Profit (€)" : "Zisk (€)"}</th>
            <th>${t("mantingale.streak")}</th>
            <th>${CURRENT_LANG === "en" ? "Result" : "Výsledok"}</th>
          </tr>
        </thead>
        <tbody>
    `;

    players.forEach((p) => {
      const teamAbbrev = getPlayerTeamAbbrev(p.name);
      const playerDisplay = teamAbbrev ? `${p.name} <span style="color:#999; font-size:0.9em;">(${teamAbbrev})</span>` : p.name;
      
      html += `
        <tr>
          <td>${playerDisplay}</td>
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
    container.innerHTML = `<p>❌ ${err.message}</p>`;
  }
}

// === História stávok ABS (vložená pod ABS tabuľku) ===
async function displayMantingalHistory() {
  const mainContainer = document.getElementById("mantingal-container");
  if (!mainContainer) return;

  // vytvor nový blok pre históriu
  const historyDiv = document.createElement("div");
  historyDiv.id = "mantingal-history";
  historyDiv.innerHTML = `<h3>${t("mantingale.historyTitle")}</h3><p>${t("mantingale.loadingData")}</p>`;
  mainContainer.appendChild(historyDiv);

  try {
    const resp = await fetch("/api/mantingal?action=history&limit=50");
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.bets)) {
      historyDiv.innerHTML = `<p>${t("mantingale.historyLoadFailed")}</p>`;
      return;
    }

    const bets = data.bets;
    if (!bets.length) {
      historyDiv.innerHTML = `<h3>${t("mantingale.historyTitle")}</h3><p>${t("mantingale.historyEmpty")}</p>`;
      return;
    }

    // vytvor tabuľku
    let html = `
      <h3>${t("mantingale.historyTitle")}</h3>
      <table>
        <thead>
          <tr>
            <th>${t("mantingale.date")}</th>
            <th>${t("table.player")}</th>
            <th>${t("mantingale.result")}</th>
            <th>${CURRENT_LANG === "en" ? "Stake (€)" : "Stávka (€)"}</th>
            <th>${CURRENT_LANG === "en" ? "Profit after (€)" : "Profit po (€)"}</th>
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
          <td>${new Date(b.ts).toLocaleString(CURRENT_LANG === "en" ? "en-US" : "sk-SK")}</td>
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
    <h2>${t("strategies.title")}</h2>
    <p>${t("strategies.loading")}</p>
  `;

  try {
    const resp = await fetch("/api/strategies", { cache: "no-store" });
    const data = await resp.json();

    if (!data.ok || !Array.isArray(data.players)) {
      throw new Error(data.error || t("common.failedToLoad"));
    }

    wrap.innerHTML = `
      <h2>${t("strategies.title")}</h2>
      <p>${t("strategies.count", { count: data.count })}</p>
      <p>${t("strategies.showFirst")}</p>
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
          <th>${CURRENT_LANG === "en" ? "Name" : "Meno"}</th>
          <th>${t("table.team")}</th>
          <th>${CURRENT_LANG === "en" ? "Country" : "Krajina"}</th>
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
      <h2>${t("strategies.title")}</h2>
      <p style="color:red;">❌ ${CURRENT_LANG === "en" ? "Error" : "Chyba"}: ${err.message}</p>
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

// expose for CTA helper
window.hideAllPremiumUI = hideAllPremiumUI;

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
      if (authMsg) authMsg.textContent = t("premium.loginExpired");
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
      alert(t("premium.mustLoginFirst"));
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
        alert(t("premium.paymentCreateFailed"));
        return;
      }

      // 🔥 presmerovanie na Stripe Checkout
      window.location.href = data.url;

    } catch (err) {
      console.error(err);
      alert(t("premium.paymentStartError"));
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

  // VIP tips (today)
  await renderVipTips();

  return;
}

// expose for CTA helper
window.checkPremiumStatus = checkPremiumStatus;

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
    if (authMsg) authMsg.textContent = t("premium.connectionError");
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
      msg.textContent = t("premium.fillAll");
      return;
    }

    if (pass.length < 8) {
      msg.textContent = t("premium.passMin");
      return;
    }

    if (pass !== pass2) {
      msg.textContent = t("premium.passMismatch");
      return;
    }

    msg.textContent = t("premium.creatingAccount");

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
        msg.textContent = data?.error_description || data?.error || t("premium.signupFailed");
        return;
      }

      msg.textContent = t("premium.accountCreated");

      // Ak má access_token, automaticky prihlásiť a zobraziť locked box
      if (data.access_token) {
        localStorage.setItem("sb-access-token", data.access_token);
        if (data.refresh_token) {
          localStorage.setItem("sb-refresh-token", data.refresh_token);
        }
        
        // Po 1.5s zavolať checkPremiumStatus, ktorý zobrazí locked box
        setTimeout(async () => {
          await checkPremiumStatus();
        }, 1500);
      } else {
        // Ak nemá token (email confirmation), vrátiť na login
        setTimeout(() => {
          hideAllPremiumUI();
          document.getElementById("premium-not-logged").style.display = "block";
        }, 1500);
      }

    } catch (err) {
      console.error(err);
      msg.textContent = t("premium.registerError");
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

// Funkcia na konverziu názvu tímu na abbreviatúru
function getTeamAbbrev(teamName) {
  if (!teamName) return "";
  
  const TEAM_NAME_TO_ABBREV = {
    // Krátke názvy (posledné slovo)
    "Maple Leafs":"TOR","Penguins":"PIT","Red Wings":"DET","Wings":"DET","Stars":"DAL",
    "Capitals":"WSH","Rangers":"NYR","Bruins":"BOS","Canadiens":"MTL",
    "Senators":"OTT","Sabres":"BUF","Islanders":"NYI","Devils":"NJD",
    "Hurricanes":"CAR","Panthers":"FLA","Wild":"MIN","Predators":"NSH",
    "Blackhawks":"CHI","Flyers":"PHI","Avalanche":"COL","Oilers":"EDM",
    "Flames":"CGY","Golden Knights":"VGK","Knights":"VGK","Kings":"LAK","Kraken":"SEA",
    "Sharks":"SJS","Ducks":"ANA","Lightning":"TBL","Jets":"WPG",
    "Coyotes":"ARI","Blues":"STL","Blue Jackets":"CBJ",
    "Mammoth":"UTA","Canucks":"VAN",
    // Celé názvy (pre istotu)
    "Toronto Maple Leafs":"TOR","Pittsburgh Penguins":"PIT","Detroit Red Wings":"DET","Dallas Stars":"DAL",
    "Washington Capitals":"WSH","New York Rangers":"NYR","Boston Bruins":"BOS","Montreal Canadiens":"MTL",
    "Ottawa Senators":"OTT","Buffalo Sabres":"BUF","New York Islanders":"NYI","New Jersey Devils":"NJD",
    "Carolina Hurricanes":"CAR","Florida Panthers":"FLA","Minnesota Wild":"MIN","Nashville Predators":"NSH",
    "Chicago Blackhawks":"CHI","Philadelphia Flyers":"PHI","Colorado Avalanche":"COL","Edmonton Oilers":"EDM",
    "Calgary Flames":"CGY","Vegas Golden Knights":"VGK","Los Angeles Kings":"LAK","Seattle Kraken":"SEA",
    "San Jose Sharks":"SJS","Anaheim Ducks":"ANA","Tampa Bay Lightning":"TBL","Winnipeg Jets":"WPG",
    "Arizona Coyotes":"ARI","St. Louis Blues":"STL","Columbus Blue Jackets":"CBJ",
    "Utah Mammoth":"UTA","Vancouver Canucks":"VAN"
  };
  
  // Skús presné zhodu
  if (TEAM_NAME_TO_ABBREV[teamName]) {
    return TEAM_NAME_TO_ABBREV[teamName];
  }
  
  // Skús extrahovať posledné slovo
  const parts = String(teamName).trim().split(/\s+/);
  if (parts.length > 0) {
    const lastWord = parts[parts.length - 1];
    if (TEAM_NAME_TO_ABBREV[lastWord]) {
      return TEAM_NAME_TO_ABBREV[lastWord];
    }
  }
  
  // Debug: ak sa nenašiel
  console.warn(`⚠️ Tím "${teamName}" sa nenašiel v mapovaní`);
  return "";
}

// Funkcia na získanie abbreviatúry tímu hráča
function getPlayerTeamAbbrev(playerName, usePremiumCache = false) {
  if (!playerName) return "";
  
  // Pre premium sekciu použij cache
  if (usePremiumCache && PREMIUM_PLAYERS_CACHE && PREMIUM_PLAYERS_CACHE.length > 0) {
    // Skús presné zhodu
    let player = PREMIUM_PLAYERS_CACHE.find(p => 
      p.name === playerName || 
      p.name.toLowerCase() === playerName.toLowerCase()
    );
    
    // Ak sa nenašiel, skús podľa priezviska
    if (!player) {
      const searchLastName = playerName.trim().split(/\s+/).pop().toLowerCase();
      player = PREMIUM_PLAYERS_CACHE.find(p => {
        const pLastName = p.name.split(' ').pop().toLowerCase();
        return pLastName === searchLastName;
      });
    }
    
    if (player && player.team) {
      return getTeamAbbrev(player.team);
    }
  }
  
  // Pre ABS sekciu použij playerTeams
  if (playerTeams && Object.keys(playerTeams).length > 0) {
    // Extrahuj priezvisko (posledné slovo, odstráň bodky)
    const parts = String(playerName).trim().split(/\s+/);
    if (parts.length > 0) {
      let lastName = parts[parts.length - 1].toLowerCase();
      // Odstráň bodky a špeciálne znaky
      lastName = lastName.replace(/[.,]/g, '');
      
      let teamFullName = playerTeams[lastName] || "";
      
      // Ak sa nenašiel, skús aj bez posledného znaku (ak je to skratka)
      if (!teamFullName && lastName.length > 1) {
        const altLastName = lastName.slice(0, -1);
        teamFullName = playerTeams[altLastName] || "";
      }
      
      if (teamFullName) {
        return getTeamAbbrev(teamFullName);
      }
    }
  }
  
  // Fallback: skús nájsť v premium cache podľa priezviska
  if (PREMIUM_PLAYERS_CACHE && PREMIUM_PLAYERS_CACHE.length > 0) {
    const searchLastName = playerName.trim().split(/\s+/).pop().toLowerCase().replace(/[.,]/g, '');
    const player = PREMIUM_PLAYERS_CACHE.find(p => {
      const pLastName = p.name.split(' ').pop().toLowerCase();
      return pLastName === searchLastName || pLastName.startsWith(searchLastName) || searchLastName.startsWith(pLastName);
    });
    
    if (player && player.team) {
      return getTeamAbbrev(player.team);
    }
  }
  
  return "";
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

  // Zabezpeč, že PREMIUM_PLAYERS_CACHE je načítaný
  if (!PREMIUM_PLAYERS_CACHE || PREMIUM_PLAYERS_CACHE.length === 0) {
    await loadPremiumTeams();
  }

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
      if (msg) msg.textContent = t("premium.noPlayers");
      return;
    }

    // Zoradiť hráčov podľa balance (od najvyššieho po najnižší)
    const sortedEntries = entries.sort((a, b) => {
      const balanceA = Number(a[1].balance || 0);
      const balanceB = Number(b[1].balance || 0);
      return balanceB - balanceA; // descending order
    });

    for (const [name, p] of sortedEntries) {
      const teamAbbrev = getPlayerTeamAbbrev(name, true); // Použi premium cache
      const formattedName = formatPlayerName(name);
      const playerDisplay = teamAbbrev ? `${formattedName} <span style="color:#999; font-size:0.9em;">(${teamAbbrev})</span>` : formattedName;

      const tr = document.createElement("tr");
      tr.innerHTML = `
  <td>${playerDisplay}</td>
  <td>${p.stake}</td>
  <td>${p.streak}</td>
  <td class="balance">${Number(p.balance).toFixed(2)} €</td>
  <td>${Number(p.odds || 2.2).toFixed(2)}</td>

  <td class="premium-actions">
    <button
      class="btn-detail vip-mtg-detail-btn"
      data-player="${name}"
    >
      ${t("common.detail")}
    </button>

    <button
      class="btn-delete"
      onclick="deletePremiumPlayer('${encodeURIComponent(name)}')"
    >
      ${t("common.delete")}
    </button>
  </td>
`;
      tbody.appendChild(tr);
    }

     // 🎨 Zafarbenie balance (plus / mínus)
tbody.querySelectorAll("td.balance").forEach(td => {
  const value = parseFloat(td.textContent.replace(",", "."));
  if (isNaN(value)) return;

  if (value > 0) td.classList.add("balance-plus");
  else if (value < 0) td.classList.add("balance-minus");
});

  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = t("premium.loadPlayersError");
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
    alert(t("premium.historyLoadFailed"));
    return;
  }

  document.getElementById("vip-mtg-player-name").textContent = player;

  const tbody = document.getElementById("vip-mtg-history-body");
  tbody.innerHTML = "";

  data.history
    .filter(h => h.result !== "skip")
    .forEach((h) => {
      const gameDisplay = formatGameId(h.gameId);
      tbody.innerHTML += `
        <tr>
          <td>${h.date}</td>
          <td>${gameDisplay}</td>
          <td>${h.goals === null ? "-" : h.goals}</td>
          <td>${h.result}</td>
          <td>${h.profitChange}</td>
          <td class="balance">${h.balanceAfter}</td>
        </tr>
      `;
    });

     // 🎨 Zafarbenie balance (plus / mínus)
tbody.querySelectorAll("td.balance").forEach(td => {
  const value = parseFloat(td.textContent.replace(",", "."));
  if (isNaN(value)) return;

  if (value > 0) td.classList.add("balance-plus");
  else if (value < 0) td.classList.add("balance-minus");
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
  if (!confirm(t("premium.confirmDelete", { name }))) return;

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

  teamSelect.innerHTML = `<option value="">${t("premium.selectTeamPlaceholder")}</option>`;
  playerSelect.innerHTML = `<option value="">${t("premium.selectTeamFirst")}</option>`;
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

      playerSelect.innerHTML = `<option value="">${t("premium.selectPlayerPlaceholder")}</option>`;
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
    teamSelect.innerHTML = `<option value="">${t("premium.teamsLoadError")}</option>`;
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
    playerSelect.innerHTML = `<option value="">${CURRENT_LANG === "en" ? "No players" : "Žiadni hráči"}</option>`;
    return;
  }

  playerSelect.innerHTML = `<option value="">${t("premium.selectPlayerPlaceholder")}</option>`;

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
    if (msg) msg.textContent = t("premium.addPick");
    return;
  }

  const team = teamSelect.value;
  const player = playerSelect.value;

  // 🔥 ODDS Z <option data-odds="">
  const selectedOption =
    playerSelect.options[playerSelect.selectedIndex];
  const odds = selectedOption?.dataset?.odds;

  if (!odds) {
    if (msg) msg.textContent = t("premium.noOdds");
    return;
  }

  if (msg) msg.textContent = t("premium.adding");

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
      if (msg) msg.textContent = data.error || t("premium.serverError");
      return;
    }

    if (msg) msg.textContent = t("premium.added", { player, odds });
    await loadPremiumPlayers();

  } catch (err) {
    console.error(err);
    if (msg) msg.textContent = t("premium.serverError");
  }
}

// Presun na analyticke statistiky v premium ===
function scrollToPremiumAnalytics() {
  const section = document.getElementById("premium-analytics");
  if (!section) return;

  section.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

// Analyticke statistiky v premium ===
function renderPremiumAnalytics(standings) {
  if (!Array.isArray(standings) || !standings.length) return;

  // Pomocná funkcia – riadok tabuľky
  const row = (t, i, value, sub = "") => `
    <tr>
      <td>${i + 1}</td>
      <td class="team-cell">
        <img src="${t.teamLogo}" alt="">
        <span>${t.teamAbbrev?.default}</span>
      </td>
      <td class="value">${value}</td>
      <td class="sub">${sub}</td>
    </tr>
  `;

  // ===== 1. TOP FORMA (L10 POINTS) =====
  const byForm = standings
    .slice()
    .sort((a, b) => (b.l10Points ?? 0) - (a.l10Points ?? 0))
    .slice(0, 10);

  document.getElementById("box-form-l10").innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr><th>#</th><th>Tím</th><th>Body</th><th>Bilancia</th></tr>
      </thead>
      <tbody>
        ${byForm.map((t, i) =>
          row(
            t,
            i,
            t.l10Points,
            `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`
          )
        ).join("")}
      </tbody>
    </table>
  `;

  // ===== 2. TOP OFENZÍVA (L10 GOALS FOR) =====
  const byOffense = standings
    .slice()
    .sort((a, b) => (b.l10GoalsFor ?? 0) - (a.l10GoalsFor ?? 0))
    .slice(0, 10);

  document.getElementById("box-offense-l10").innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr><th>#</th><th>Tím</th><th>G</th><th></th></tr>
      </thead>
      <tbody>
        ${byOffense.map((t, i) =>
          row(t, i, t.l10GoalsFor)
        ).join("")}
      </tbody>
    </table>
  `;

  // ===== 3. NAJSLABŠIA OBRANA (L10 GOALS AGAINST) =====
  const byDefense = standings
    .slice()
    .sort((a, b) => (b.l10GoalsAgainst ?? 0) - (a.l10GoalsAgainst ?? 0))
    .slice(0, 10);
  document.getElementById("box-defense-l10").innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr><th>#</th><th>Tím</th><th>GA</th><th></th></tr>
      </thead>
      <tbody>
        ${byDefense.map((t, i) =>
          row(t, i, t.l10GoalsAgainst)
        ).join("")}
      </tbody>
    </table>
  `;

  // ===== 4. TREND (L10 GOAL DIFFERENTIAL) =====
  const byTrend = standings
    .slice()
    .sort((a, b) => (b.l10GoalDifferential ?? 0) - (a.l10GoalDifferential ?? 0))
    .slice(0, 10);

  document.getElementById("box-trend-l10").innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr><th>#</th><th>Tím</th><th>Rozdiel</th><th></th></tr>
      </thead>
      <tbody>
        ${byTrend.map((t, i) =>
          row(
            t,
            i,
            `${t.l10GoalDifferential > 0 ? "+" : ""}${t.l10GoalDifferential}`
          )
        ).join("")}
      </tbody>
    </table>
  `;
}

// ===============================
// 👑 VIP TIPY – strelci + góly (dnešné zápasy)
// ===============================
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findStandingByCode(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  return (LAST_STANDINGS || []).find((t) => String(t?.teamAbbrev?.default || "").toUpperCase() === c) || null;
}

function findTeamCodeByFullName(fullName) {
  const n = norm(fullName);
  if (!n) return "";
  const hit = (LAST_STANDINGS || []).find((t) => {
    const nm = norm(t?.teamName?.default);
    return nm === n || nm.includes(n) || n.includes(nm);
  });
  return String(hit?.teamAbbrev?.default || "").toUpperCase();
}

function estimateGameTotalByCodes(homeCode, awayCode) {
  const h = findStandingByCode(homeCode);
  const a = findStandingByCode(awayCode);
  if (!h || !a) return null;

  const hGF = Number(h.l10GoalsFor ?? 0);
  const hGA = Number(h.l10GoalsAgainst ?? 0);
  const aGF = Number(a.l10GoalsFor ?? 0);
  const aGA = Number(a.l10GoalsAgainst ?? 0);

  if (![hGF, hGA, aGF, aGA].every((x) => Number.isFinite(x) && x > 0)) return null;

  // per-game averages over last 10
  const hGFpg = hGF / 10;
  const hGApg = hGA / 10;
  const aGFpg = aGF / 10;
  const aGApg = aGA / 10;

  // simple matchup model
  const expHome = (hGFpg + aGApg) / 2;
  const expAway = (aGFpg + hGApg) / 2;
  const total = expHome + expAway;

  // choose typical NHL total line
  const line = total >= 6.0 ? 6.5 : 5.5;
  const delta = total - line;

  let reco = "none";
  if (delta >= 0.35) reco = "over";
  else if (delta <= -0.35) reco = "under";

  const confidence = Math.round(50 + 25 * Math.min(1, Math.abs(delta) / 1.2));

  return {
    homeCode: String(homeCode || "").toUpperCase(),
    awayCode: String(awayCode || "").toUpperCase(),
    total: Number(total.toFixed(1)),
    line,
    reco,
    confidence,
  };
}

async function renderVipTips() {
  const wrap = document.getElementById("vip-tips-body");
  if (!wrap) return;

  // Aktualizuj dátum v headeri
  const dateElement = document.getElementById("vip-tips-date");
  if (dateElement) {
    const today = new Date();
    const dateStr = CURRENT_LANG === "en" 
      ? today.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : today.toLocaleDateString("sk-SK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    dateElement.textContent = dateStr;
  }

  wrap.innerHTML = `<p class="nhl-muted">${t("vipTips.loading")}</p>`;

  // Ensure we have matches/ratings/standings in memory
  if (!LAST_STANDINGS?.length || !playerRatings || !Object.keys(playerRatings).length) {
    try {
      await fetchMatches();
    } catch {
      // ignore
    }
  }

  let matchesToday = [];
  try {
    const homeResp = await fetch("/api/home", { cache: "no-store" });
    const homeData = homeResp.ok ? await homeResp.json() : {};
    matchesToday = Array.isArray(homeData.matchesToday) ? homeData.matchesToday : [];
  } catch {
    matchesToday = [];
  }

  if (!matchesToday.length) {
    wrap.innerHTML = `<p class="nhl-muted">${t("vipTips.noGames")}</p>`;
    return;
  }

  // Reálne dnešné zápasy – používame priamo kódy z /api/home (homeCode/awayCode)
  const matchPairs = matchesToday
    .map((m) => {
      const homeName = m.homeName || "";
      const awayName = m.awayName || "";
      const homeCode = String(m.homeCode || "").toUpperCase() || findTeamCodeByFullName(homeName);
      const awayCode = String(m.awayCode || "").toUpperCase() || findTeamCodeByFullName(awayName);
      if (!homeCode || !awayCode) return null;
      return {
        id: m.id,
        homeName,
        awayName,
        homeCode,
        awayCode,
        startTime: m.startTime || "",
        homeLogo: m.homeLogo || "",
        awayLogo: m.awayLogo || "",
      };
    })
    .filter(Boolean);

  if (!matchPairs.length) {
    wrap.innerHTML = `<p class="nhl-muted">${t("vipTips.noGames")}</p>`;
    return;
  }

  const codeToOpp = new Map();
  const todayCodes = new Set();
  matchPairs.forEach((p) => {
    todayCodes.add(p.homeCode);
    todayCodes.add(p.awayCode);
    codeToOpp.set(p.homeCode, p.awayCode);
    codeToOpp.set(p.awayCode, p.homeCode);
  });

  // ===== SCORER PICKS (Top 3) – 3 rôzne zápasy =====
  // Pull player stats to enrich scoring model (shots, TOI, PP goals)
  let statsData = {};
  try {
    const s = await fetch("/api/statistics", { cache: "no-store" });
    statsData = s.ok ? await s.json() : {};
  } catch {
    statsData = {};
  }

  const statPools = [
    statsData?.topGoals,
    statsData?.topShots,
    statsData?.topPowerPlayGoals,
    statsData?.topTOI,
    statsData?.topPoints,
  ].filter(Array.isArray);

  const statsByName = new Map();
  const nameKey = (n) => norm(String(n || "").replace(/\./g, ""));
  for (const arr of statPools) {
    for (const p of arr) {
      const k = nameKey(p?.name);
      if (!k) continue;
      const prev = statsByName.get(k) || {};
      statsByName.set(k, {
        name: p?.name || prev.name,
        team: p?.team || prev.team, // team code
        gamesPlayed: Number(p?.gamesPlayed ?? prev.gamesPlayed ?? 0),
        goals: Number(p?.goals ?? prev.goals ?? 0),
        shots: Number(p?.shots ?? prev.shots ?? 0),
        powerPlayGoals: Number(p?.powerPlayGoals ?? prev.powerPlayGoals ?? 0),
        toi: Number(p?.toi ?? prev.toi ?? 0), // avg TOI minutes (from /api/statistics)
      });
    }
  }

  const ratingEntries = Object.entries(playerRatings || {}).filter(([, r]) => Number.isFinite(Number(r)));
  const allCandidates = [];
  for (const [player, ratingRaw] of ratingEntries) {
    const rating = Number(ratingRaw);
    const k = nameKey(player);
    const st = statsByName.get(k);

    // Determine team code
    let teamCode = "";
    if (st?.team) teamCode = String(st.team).toUpperCase();
    if (!teamCode) {
      const parts = String(player).trim().split(" ");
      const lastName = parts[parts.length - 1]?.replace(/\./g, "").toLowerCase();
      const teamFull = lastName && playerTeams ? (playerTeams[lastName] || "") : "";
      teamCode = teamFull ? findTeamCodeByFullName(teamFull) : "";
    }

    if (!teamCode) continue;
    if (!todayCodes.has(teamCode)) continue; // len dnešné reálne tímy

    const gp = Number(st?.gamesPlayed || 0);
    const shotsPerGame = gp > 0 ? Number((Number(st?.shots || 0) / gp).toFixed(2)) : 0;
    const goalsPerGame = gp > 0 ? Number((Number(st?.goals || 0) / gp).toFixed(2)) : 0;
    const ppGoalsPerGame = gp > 0 ? Number((Number(st?.powerPlayGoals || 0) / gp).toFixed(2)) : 0;
    const toiMin = Number(st?.toi || 0);

    allCandidates.push({
      player,
      rating,
      teamCode,
      gp,
      shotsPerGame,
      goalsPerGame,
      ppGoalsPerGame,
      toiMin,
    });
  }

  const minmax = (arr, get) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const x of arr) {
      const v = Number(get(x));
      if (!Number.isFinite(v)) continue;
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    if (!Number.isFinite(mn)) mn = 0;
    if (!Number.isFinite(mx)) mx = 0;
    return { mn, mx };
  };
  const norm01 = (v, mn, mx) => {
    const denom = mx - mn;
    if (!Number.isFinite(v)) return 0;
    if (Math.abs(denom) < 1e-9) return 0.5;
    return Math.max(0, Math.min(1, (v - mn) / denom));
  };

  const rRange = minmax(allCandidates, (x) => x.rating);
  const sRange = minmax(allCandidates, (x) => x.shotsPerGame);
  const gRange = minmax(allCandidates, (x) => x.goalsPerGame);
  const ppRange = minmax(allCandidates, (x) => x.ppGoalsPerGame);
  const toiRange = minmax(allCandidates, (x) => x.toiMin);

  // Score model: rating + shots + TOI + PP goals + goals
  for (const c of allCandidates) {
    const r = norm01(c.rating, rRange.mn, rRange.mx);
    const sh = norm01(c.shotsPerGame, sRange.mn, sRange.mx);
    const g = norm01(c.goalsPerGame, gRange.mn, gRange.mx);
    const ppg = norm01(c.ppGoalsPerGame, ppRange.mn, ppRange.mx);
    const toi = norm01(c.toiMin, toiRange.mn, toiRange.mx);

    c.score = 0.45 * r + 0.20 * sh + 0.15 * toi + 0.10 * ppg + 0.10 * g;
    c.confidence = Math.round(60 + 35 * c.score); // 60–95
  }

  // pick best candidate per game, then take top 3 games
  const bestPerGame = [];
  for (const game of matchPairs) {
    const pool = allCandidates.filter((c) => c.teamCode === game.homeCode || c.teamCode === game.awayCode);
    if (!pool.length) continue;
    pool.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    bestPerGame.push({ game, pick: pool[0] });
  }
  bestPerGame.sort((a, b) => (b.pick?.score ?? 0) - (a.pick?.score ?? 0));
  const topGamePicks = bestPerGame.slice(0, 3);

  // Store statsByName globally so it's accessible in showVipTipAnalysis
  window.VIP_STATS_BY_NAME = statsByName;
  
  const scorerRows = topGamePicks.map(({ game, pick }, idx) => {
    const metaTop = `${game.homeCode} ${t("vipTips.vs")} ${game.awayCode}${game.startTime ? ` • ${game.startTime}` : ""}`;
    const metaStats = `TOI ${pick.toiMin || "-"} | S/G ${pick.shotsPerGame || "-"} | PPG/G ${pick.ppGoalsPerGame || "-"}`;
    const playerKey = `vip-tip-${idx}`;
    const k = nameKey(pick.player);
    const st = statsByName.get(k);
    const totalGoals = st?.goals || 0;
    const totalShots = st?.shots || 0;
    const totalAssists = st?.assists || 0;
    const totalPoints = (totalGoals || 0) + (totalAssists || 0);
    const gamesPlayed = st?.gamesPlayed || pick.gp || 0;
    const oppCode = pick.teamCode === game.homeCode ? game.awayCode : game.homeCode;
    
    // Escape single quotes in player name for onclick
    const playerNameEscaped = pick.player.replace(/'/g, "\\'");
    
    return `
      <div class="vip-tip-row" data-player-key="${playerKey}" data-player-name="${pick.player}">
        <div class="vip-tip-left">
          <div class="vip-tip-rank">${idx + 1}</div>
          <div class="vip-tip-text">
            <div class="vip-tip-title"><b>${pick.player}</b></div>
            <div class="vip-tip-meta">${metaTop}</div>
            <div class="vip-tip-meta">${metaStats}</div>
          </div>
        </div>
        <div class="vip-tip-right">
          <div class="vip-tip-badge">${pick.confidence}%</div>
          <div class="vip-tip-label">${t("vipTips.confidence")}</div>
          <button class="vip-tip-analysis-btn" onclick="showVipTipAnalysis('${playerNameEscaped}', '${pick.teamCode}', '${oppCode}', event)">
            ${t("vipTips.analysis")}
          </button>
        </div>
      </div>
    `;
  }).join("");

  // ===== TOTAL GOALS PICKS =====
  const totals = matchPairs
    .map((p) => {
      const est = estimateGameTotalByCodes(p.homeCode, p.awayCode);
      if (!est) return null;
      return { ...est, homeName: p.homeName, awayName: p.awayName, homeLogo: p.homeLogo, awayLogo: p.awayLogo, startTime: p.startTime };
    })
    .filter(Boolean);

  totals.sort((a, b) => b.confidence - a.confidence);
  const topTotals = totals.slice(0, 3);

  const totalsRows = topTotals.map((g, idx) => {
    const recoText =
      g.reco === "over"
        ? `${t("vipTips.over")} ${g.line}`
        : g.reco === "under"
        ? `${t("vipTips.under")} ${g.line}`
        : t("vipTips.noReco");
    
    const recoClass = g.reco === "over" ? "vip-reco-over" : g.reco === "under" ? "vip-reco-under" : "";

    return `
      <div class="vip-tip-row">
        <div class="vip-tip-left">
          <div class="vip-tip-text">
            <div class="vip-tip-title"><b>${g.homeCode}</b> ${t("vipTips.vs")} <b>${g.awayCode}</b></div>
            <div class="vip-tip-meta">${t("vipTips.predictedTotal")}: ${g.total}</div>
            <div class="vip-tip-meta">${t("vipTips.reco")}: <b class="${recoClass}">${recoText}</b></div>
          </div>
        </div>
        <div class="vip-tip-right">
          <div class="vip-tip-badge">${g.confidence}%</div>
          <div class="vip-tip-label">${t("vipTips.confidence")}</div>
          <button class="vip-tip-analysis-btn" onclick="showVipTotalAnalysis('${g.homeCode}', '${g.awayCode}', ${g.total}, '${g.reco}', ${g.line}, ${g.confidence}, event)">
            ${t("vipTips.analysis")}
          </button>
        </div>
      </div>
    `;
  }).join("");

  wrap.innerHTML = `
    <div class="vip-tip-card">
      <h3 class="vip-tip-card-title">${t("vipTips.sectionScorers")}</h3>
      ${scorerRows || `<p class="nhl-muted">${t("common.noData")}</p>`}
    </div>

    <div class="vip-tip-card">
      <h3 class="vip-tip-card-title">${t("vipTips.sectionTotals")}</h3>
      ${totalsRows || `<p class="nhl-muted">${t("common.noData")}</p>`}
    </div>
  `;
}

// ===============================
// 👑 VIP TIP ANALYSIS MODAL (STABLE VERSION)
// ===============================

// Ensure overlay is always attached directly to <body>
// (critical for iOS Safari + position:fixed)
function ensureVipModalInBody() {
  const overlay = document.getElementById("vip-tip-analysis-overlay");
  if (!overlay) return;
  if (overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }
}

// Robust viewport-based modal positioning with hard fallback
function positionModalInViewport(modalContent, buttonRect) {
  const EDGE = 20;
  const MARGIN = 12;

  // 🚨 HARD FALLBACK — ALWAYS SAFE
  if (
    !buttonRect ||
    typeof buttonRect.top !== "number" ||
    typeof buttonRect.left !== "number"
  ) {
    modalContent.style.top = "50%";
    modalContent.style.left = "50%";
    modalContent.style.transform = "translate(-50%, -50%)";
    return;
  }

  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const MODAL_WIDTH = modalContent.offsetWidth || 560;
  const MODAL_HEIGHT = modalContent.offsetHeight || 400;

  let top = buttonRect.bottom + MARGIN;
  let left = buttonRect.left + buttonRect.width / 2;

  // If no space below → open above
  if (top + MODAL_HEIGHT + EDGE > vh) {
    top = buttonRect.top - MODAL_HEIGHT - MARGIN;
  }

  // Clamp into viewport
  top = Math.max(EDGE, Math.min(top, vh - MODAL_HEIGHT - EDGE));
  left = Math.max(
    MODAL_WIDTH / 2 + EDGE,
    Math.min(left, vw - MODAL_WIDTH / 2 - EDGE)
  );

  modalContent.style.top = `${top}px`;
  modalContent.style.left = `${left}px`;
  modalContent.style.transform = "translateX(-50%)";
}

// ===============================
// OPEN PLAYER ANALYSIS MODAL
// ===============================
async function showVipTipAnalysis(playerName, teamCode, oppCode, event) {
  const modal = document.getElementById("vip-tip-analysis-modal");
  const overlay = document.getElementById("vip-tip-analysis-overlay");
  if (!modal || !overlay) return;

  ensureVipModalInBody();

  const modalContent = modal; // IMPORTANT: work directly with the real modal element

  // ✅ SAVE RECT SYNCHRONOUSLY (before await)
  const btnRect = event?.currentTarget?.getBoundingClientRect() || null;

  // Show overlay as flex → real modal window
  overlay.style.display = "flex";

  // Loading state
  modal.innerHTML = `
    <p style="text-align:center;color:#00eaff;padding:40px;">
      ${t("common.loading")}
    </p>
  `;

  // Initial positioning (before fetch)
  requestAnimationFrame(() => {
    positionModalInViewport(modalContent, btnRect);
  });

  // Fetch fresh statistics
  let statsData = {};
  try {
    const s = await fetch("/api/statistics", { cache: "no-store" });
    statsData = s.ok ? await s.json() : {};
  } catch (err) {
    console.warn("Failed to fetch stats:", err);
  }

  // Build stats map with all players (not just top lists)
  const allPlayerArrays = [
    ...(statsData?.topGoals || []),
    ...(statsData?.topShots || []),
    ...(statsData?.topPowerPlayGoals || []),
    ...(statsData?.topTOI || []),
    ...(statsData?.topPoints || []),
    ...(statsData?.topAssists || []),
  ];

  const nameKey = (n) => norm(String(n || "").replace(/\./g, ""));
  const statsByName = new Map();
  
  // Build map with all players - using the same approach as in renderVipTips
  for (const p of allPlayerArrays) {
    if (!p?.name) continue;
    const k = nameKey(p.name);
    if (!k) continue;
    const prev = statsByName.get(k) || {};
    statsByName.set(k, {
      name: p.name || prev.name,
      team: p.team || prev.team,
      gamesPlayed: Number(p.gamesPlayed ?? prev.gamesPlayed ?? 0),
      goals: Number(p.goals ?? prev.goals ?? 0),
      assists: Number(p.assists ?? prev.assists ?? 0),
      points: Number(p.points ?? prev.points ?? 0),
      shots: Number(p.shots ?? prev.shots ?? 0),
      powerPlayGoals: Number(p.powerPlayGoals ?? prev.powerPlayGoals ?? 0),
      toi: Number(p.toi ?? prev.toi ?? 0),
    });
  }

  // Find player stats - try multiple name variations (similar to api/ai.js findPlayerRating)
  // IMPORTANT: Use norm() to match how keys are created in statsByName Map
  const playerNameNorm = norm(playerName).replace(/\./g, "");
  const nameParts = playerNameNorm.split(" ").filter(Boolean);
  const firstPart = nameParts[0] || "";
  const lastPart = nameParts[nameParts.length - 1] || "";
  
  // Generate name variants to try (all normalized with norm())
  const variants = [
    playerNameNorm, // "kirill kaprizov" or "k kaprizov"
    firstPart.length > 0 && lastPart ? `${firstPart.charAt(0)} ${lastPart}` : null, // "k kaprizov"
    firstPart.length > 0 && lastPart ? `${firstPart.charAt(0)}${lastPart}` : null, // "kkaprizov"
    lastPart, // "kaprizov"
  ].filter(Boolean);
  
  let st = null;
  for (const variant of variants) {
    st = statsByName.get(variant);
    if (st) {
      console.log("VIP Analysis - Found by variant:", playerName, "variant:", variant, "->", st.name);
      break;
    }
  }
  
  // If still not found, try to find by last name only
  if (!st && lastPart) {
    for (const [key, value] of statsByName.entries()) {
      if (!value.name) continue;
      const valueNameNorm = norm(value.name).replace(/\./g, "");
      const valueParts = valueNameNorm.split(" ").filter(Boolean);
      if (valueParts.length > 0) {
        const valueLastName = valueParts[valueParts.length - 1];
        if (valueLastName === lastPart) {
          st = value;
          console.log("VIP Analysis - Found by last name:", playerName, "->", value.name);
          break;
        }
      }
    }
  }
  
  // Debug logging
  if (!st) {
    console.warn("VIP Analysis - Player not found:", playerName, "Normalized:", playerNameNorm, "Variants tried:", variants);
    console.warn("Sample available keys (first 10):", Array.from(statsByName.keys()).slice(0, 10));
    console.warn("Sample stats names (first 10):", Array.from(statsByName.values()).slice(0, 10).map(v => v.name));
  }
  
  const totalGoals = st?.goals || 0;
  const totalShots = st?.shots || 0;
  const totalAssists = st?.assists || 0;
  const totalPoints = st?.points || (totalGoals + totalAssists);
  const gamesPlayed = st?.gamesPlayed || 0;
  const goalsPerGame = gamesPlayed > 0 ? (totalGoals / gamesPlayed) : 0;
  const shotsPerGame = gamesPlayed > 0 ? (totalShots / gamesPlayed) : 0;
  const ppGoalsPerGame = gamesPlayed > 0 ? ((st?.powerPlayGoals || 0) / gamesPlayed) : 0;
  const toiMin = st?.toi || 0;
  
  // Get player rating (approximate - using a default)
  const rating = 2000; // Default, could be improved later
  
  // Calculate confidence based on stats
  const confidence = Math.min(95, Math.round(60 + (goalsPerGame * 10) + (shotsPerGame * 2)));

  const oppStanding = findStandingByCode(oppCode);
  const oppDefenseRank = oppStanding ? (LAST_STANDINGS || []).filter(s => (s.l10GoalsAgainst || 0) > (oppStanding.l10GoalsAgainst || 0)).length + 1 : null;
  const oppDefenseL10 = oppStanding?.l10GoalsAgainst || 0;
  
  // Generovanie analýzy
  const reasons = [];
  if (rating > 2000) reasons.push(CURRENT_LANG === "en" ? "High player rating" : "Vysoký rating hráča");
  if (goalsPerGame > 0.4) reasons.push(CURRENT_LANG === "en" ? "Strong goal-scoring average" : "Silný priemer gólov");
  if (shotsPerGame > 3) reasons.push(CURRENT_LANG === "en" ? "High shot volume" : "Veľké množstvo striel");
  if (ppGoalsPerGame > 0.1) reasons.push(CURRENT_LANG === "en" ? "Power play effectiveness" : "Efektívnosť v presilových hrách");
  if (toiMin > 18) reasons.push(CURRENT_LANG === "en" ? "Significant ice time" : "Významný čas na ľade");
  if (oppDefenseRank && oppDefenseRank <= 10) {
    reasons.push(CURRENT_LANG === "en" 
      ? `Weak opponent defense (${oppDefenseRank}. in goals allowed)` 
      : `Slabá obrana súpera (${oppDefenseRank}. miesto v inkasovaných góloch)`);
  }

  const analysisText = CURRENT_LANG === "en"
    ? `${playerName} shows strong scoring potential based on multiple factors. With ${totalGoals} goals, ${totalAssists} assists, and ${totalPoints} points in ${gamesPlayed} games this season, he demonstrates consistent offensive production. His ${goalsPerGame.toFixed(2)} goals per game and ${shotsPerGame.toFixed(2)} shots per game indicate he's an active shooter. ${totalShots > 0 ? `With ${totalShots} total shots this season, he consistently creates scoring opportunities. ` : ""}${ppGoalsPerGame > 0 ? `His power play contribution (${ppGoalsPerGame.toFixed(2)} PPG/game) adds another dimension to his scoring. ` : ""}${toiMin > 18 ? `With ${toiMin} minutes of average ice time, he gets significant opportunities. ` : ""}${oppDefenseRank && oppDefenseRank <= 10 ? `Facing a weaker defensive team (${oppDefenseRank}. in goals allowed in L10) increases his chances. ` : ""}The AI confidence of ${confidence}% reflects these strong indicators.`
    : `${playerName} vykazuje silný strelecký potenciál na základe viacerých faktorov. S ${totalGoals} gólmi, ${totalAssists} asistenciami a ${totalPoints} bodmi v ${gamesPlayed} zápasoch tejto sezóny demonštruje konzistentnú ofenzívnu produkciu. Jeho ${goalsPerGame.toFixed(2)} gólov na zápas a ${shotsPerGame.toFixed(2)} striel na zápas naznačujú, že je aktívnym strelcom. ${totalShots > 0 ? `S ${totalShots} celkovými strelami tejto sezóny konzistentne vytvára strelecké príležitosti. ` : ""}${ppGoalsPerGame > 0 ? `Jeho príspevok v presilových hrách (${ppGoalsPerGame.toFixed(2)} PPG/zápas) pridáva ďalšiu dimenziu jeho streleckým schopnostiam. ` : ""}${toiMin > 18 ? `S ${toiMin} minútami priemerného času na ľade dostáva významné príležitosti. ` : ""}${oppDefenseRank && oppDefenseRank <= 10 ? `Proti slabšej obrane (${oppDefenseRank}. miesto v inkasovaných góloch v L10) sa zvyšujú jeho šance. ` : ""}AI confidence ${confidence}% odráža tieto silné indikátory.`;

  // Update modal content
  modal.innerHTML = `
    <h2>${t("vipTips.analysisTitle")}</h2>
    
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <h3 style="font-size: 1.4rem; color: #ffffff; margin: 0 0 8px 0;">${playerName}</h3>
      <p style="color: rgba(232, 244, 255, 0.7); margin: 0;">${teamCode} ${t("vipTips.vs")} ${oppCode}</p>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.analysisGoals")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${totalGoals}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.analysisAssists")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${totalAssists}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.analysisPoints")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${totalPoints}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.analysisShots")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${totalShots}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.analysisGames")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${gamesPlayed}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.confidence")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${confidence}%</div>
      </div>
    </div>

    <h3>${t("vipTips.analysisWhy")}</h3>
    <ul>
      ${reasons.map(r => `<li>${r}</li>`).join("")}
    </ul>

    <h3>${CURRENT_LANG === "en" ? "Detailed Analysis" : "Detailná analýza"}</h3>
    <p>${analysisText}</p>
    
    <button class="close-modal-btn" onclick="closeVipTipAnalysis()">${t("common.close")}</button>
  `;
  
  // Reposition after content loads (height may have changed)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionModalInViewport(modalContent, btnRect);
    });
  });
}

// ===============================
// 👑 VIP TOTAL GOALS ANALYSIS MODAL
// ===============================
async function showVipTotalAnalysis(homeCode, awayCode, predictedTotal, reco, line, confidence, event) {
  const modal = document.getElementById("vip-tip-analysis-modal");
  const overlay = document.getElementById("vip-tip-analysis-overlay");
  if (!modal || !overlay) return;

  const modalContent = overlay.querySelector(".modal-content");

  // ⬇️ ULOŽ RECT OKAMŽITE - ešte pred await
  const btnRect = event?.currentTarget?.getBoundingClientRect() || null;

  overlay.style.setProperty("display", "block", "important");
  modal.innerHTML = `<p style="text-align:center;color:#00eaff;padding:40px;">${t("common.loading")}</p>`;

  // Position modal in viewport (wait for dimensions to be available)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionModalInViewport(modalContent, btnRect);
    });
  });

  // Získaj štatistiky tímov
  const homeStanding = findStandingByCode(homeCode);
  const awayStanding = findStandingByCode(awayCode);
  
  // Vypočítaj priemery
  const homeGoalsFor = homeStanding?.l10GoalsFor || 0;
  const homeGoalsAgainst = homeStanding?.l10GoalsAgainst || 0;
  const awayGoalsFor = awayStanding?.l10GoalsFor || 0;
  const awayGoalsAgainst = awayStanding?.l10GoalsAgainst || 0;
  
  const homeAvgGoals = homeGoalsFor / 10;
  const homeAvgAllowed = homeGoalsAgainst / 10;
  const awayAvgGoals = awayGoalsFor / 10;
  const awayAvgAllowed = awayGoalsAgainst / 10;
  
  // Vypočítaj očakávaný počet gólov
  const expectedTotal = (homeAvgGoals + awayAvgGoals + homeAvgAllowed + awayAvgAllowed) / 2;
  
  // 🔥 KĽÚČOVÉ: Odporúčanie MUSÍ byť založené na matematike, nie na nesprávnom reco z backendu
  // Ak expectedTotal > line → MUSÍ byť OVER
  // Ak expectedTotal < line → MUSÍ byť UNDER
  const correctReco = expectedTotal > line ? "over" : expectedTotal < line ? "under" : reco;
  const isActuallyOver = expectedTotal > line;
  const isActuallyUnder = expectedTotal < line;
  const difference = Math.abs(expectedTotal - line);
  
  // Generuj dôvody na základe SPRÁVNEHO odporúčania (založeného na matematike)
  const reasons = [];
  if (correctReco === "over") {
    if (homeAvgGoals > 3) reasons.push(`${homeCode} má silnú ofenzívu (${homeAvgGoals.toFixed(2)} gólov/zápas v L10)`);
    if (awayAvgGoals > 3) reasons.push(`${awayCode} má silnú ofenzívu (${awayAvgGoals.toFixed(2)} gólov/zápas v L10)`);
    if (homeAvgAllowed > 2.5) reasons.push(`${homeCode} má slabú obranu (${homeAvgAllowed.toFixed(2)} inkasovaných/zápas v L10)`);
    if (awayAvgAllowed > 2.5) reasons.push(`${awayCode} má slabú obranu (${awayAvgAllowed.toFixed(2)} inkasovaných/zápas v L10)`);
    if (isActuallyOver) {
      reasons.push(`Očakávaný počet gólov (${expectedTotal.toFixed(2)}) je vyšší ako línia (${line}) o ${difference.toFixed(2)} gólov`);
    } else if (isActuallyUnder) {
      reasons.push(`⚠️ Poznámka: Očakávaný počet (${expectedTotal.toFixed(2)}) je nižší ako línia (${line}), ale odporúčame OVER kvôli iným faktorom`);
    }
  } else if (reco === "under") {
    if (homeAvgGoals < 2.5) reasons.push(`${homeCode} má slabú ofenzívu (${homeAvgGoals.toFixed(2)} gólov/zápas v L10)`);
    if (awayAvgGoals < 2.5) reasons.push(`${awayCode} má slabú ofenzívu (${awayAvgGoals.toFixed(2)} gólov/zápas v L10)`);
    if (homeAvgAllowed < 2) reasons.push(`${homeCode} má silnú obranu (${homeAvgAllowed.toFixed(2)} inkasovaných/zápas v L10)`);
    if (awayAvgAllowed < 2) reasons.push(`${awayCode} má silnú obranu (${awayAvgAllowed.toFixed(2)} inkasovaných/zápas v L10)`);
    reasons.push(`Očakávaný počet gólov (${expectedTotal.toFixed(2)}) je nižší ako línia (${line}) o ${difference.toFixed(2)} gólov`);
  }
  
  // Text - používa SPRÁVNE odporúčanie založené na matematike
  const actualRelation = isActuallyOver ? (CURRENT_LANG === "en" ? "exceeds" : "nad") : isActuallyUnder ? (CURRENT_LANG === "en" ? "is below" : "pod") : (CURRENT_LANG === "en" ? "matches" : "sa rovná");
  
  const analysisText = CURRENT_LANG === "en"
    ? `Based on the last 10 games statistics, ${homeCode} averages ${homeAvgGoals.toFixed(2)} goals scored and ${homeAvgAllowed.toFixed(2)} goals allowed per game. ${awayCode} averages ${awayAvgGoals.toFixed(2)} goals scored and ${awayAvgAllowed.toFixed(2)} goals allowed per game. The expected total goals for this match is ${expectedTotal.toFixed(2)}, which ${actualRelation} the line of ${line} goals. Therefore, we recommend ${correctReco === "over" ? "OVER" : "UNDER"} ${line}. The AI confidence of ${confidence}% reflects our analysis.`
    : `Na základe štatistík z posledných 10 zápasov, ${homeCode} má priemer ${homeAvgGoals.toFixed(2)} gólov strelených a ${homeAvgAllowed.toFixed(2)} gólov inkasovaných na zápas. ${awayCode} má priemer ${awayAvgGoals.toFixed(2)} gólov strelených a ${awayAvgAllowed.toFixed(2)} gólov inkasovaných na zápas. Očakávaný počet gólov pre tento zápas je ${expectedTotal.toFixed(2)}, čo je ${actualRelation} líniou ${line} gólov. Preto odporúčame ${correctReco === "over" ? "OVER" : "UNDER"} ${line}. AI confidence ${confidence}% odráža našu analýzu.`;

  // Update modal content
  modal.innerHTML = `
    <h2>${CURRENT_LANG === "en" ? "Game Total Goals Analysis" : "Analýza celkového počtu gólov"}</h2>
    
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <h3 style="font-size: 1.4rem; color: #ffffff; margin: 0 0 8px 0;">${homeCode} ${t("vipTips.vs")} ${awayCode}</h3>
      <p style="color: rgba(232, 244, 255, 0.7); margin: 0;">${CURRENT_LANG === "en" ? "Expected total" : "Očakávaný počet"}: ${expectedTotal.toFixed(2)} | ${CURRENT_LANG === "en" ? "Recommendation" : "Odporúčanie"}: <b>${correctReco === "over" ? t("vipTips.over") : t("vipTips.under")} ${line}</b></p>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${homeCode} ${CURRENT_LANG === "en" ? "Goals For" : "Góly strelené"}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${homeAvgGoals.toFixed(2)}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${homeCode} ${CURRENT_LANG === "en" ? "Goals Against" : "Góly inkasované"}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${homeAvgAllowed.toFixed(2)}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${awayCode} ${CURRENT_LANG === "en" ? "Goals For" : "Góly strelené"}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${awayAvgGoals.toFixed(2)}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${awayCode} ${CURRENT_LANG === "en" ? "Goals Against" : "Góly inkasované"}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${awayAvgAllowed.toFixed(2)}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${CURRENT_LANG === "en" ? "Expected Total" : "Očakávaný počet"}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${expectedTotal.toFixed(2)}</div>
      </div>
      <div style="background: rgba(0, 234, 255, 0.1); border: 1px solid rgba(0, 234, 255, 0.2); border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 0.75rem; color: #7fa9c9; margin-bottom: 6px;">${t("vipTips.confidence")}</div>
        <div style="font-size: 1.8rem; font-weight: 600; color: #00eaff;">${confidence}%</div>
      </div>
    </div>

    <h3>${CURRENT_LANG === "en" ? "Why this recommendation?" : "Prečo toto odporúčanie?"}</h3>
    <ul>
      ${reasons.length > 0 ? reasons.map(r => `<li>${r}</li>`).join("") : `<li>${CURRENT_LANG === "en" ? "Based on statistical analysis of team performance" : "Na základe štatistickej analýzy výkonnosti tímov"}</li>`}
    </ul>

    <h3>${CURRENT_LANG === "en" ? "Detailed Analysis" : "Detailná analýza"}</h3>
    <p>${analysisText}</p>
    
    <button class="close-modal-btn" onclick="closeVipTipAnalysis()">${t("common.close")}</button>
  `;
  
  // Reposition after content loads (height may have changed)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      positionModalInViewport(modalContent, btnRect);
    });
  });
}

function closeVipTipAnalysis(e) {
  // Rovnaký systém ako closeRatingModal - zatvor len ak klik bol na overlay, nie na content
  if (!e || e.target.id === "vip-tip-analysis-overlay") {
    const overlay = document.getElementById("vip-tip-analysis-overlay");
    if (overlay) overlay.style.display = "none";
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
    detail.innerHTML = `<p style="text-align:center;color:#00eaff;">📊 ${CURRENT_LANG === "en" ? "Loading stats..." : "Načítavam štatistiky..."}</p>`;

    let players = [];
    let title = "";
    let columns = "";

    const TYPES = {
      accuracy: {
        list: "topAccuracy",
        title: CURRENT_LANG === "en" ? "🎯 Best shooting %" : "🎯 Najlepšia strelecká úspešnosť",
        cols: CURRENT_LANG === "en" ? "<th>Goals</th><th>Shots</th><th>%</th>" : "<th>Góly</th><th>Strely</th><th>%</th>",
      },
      shots: {
        list: "topShots",
        title: CURRENT_LANG === "en" ? "🔥 Most shots" : "🔥 Najviac striel",
        cols: CURRENT_LANG === "en" ? "<th>Shots</th>" : "<th>Strely</th>",
      },
      goals: {
        list: "topGoals",
        title: CURRENT_LANG === "en" ? "🥅 Most goals" : "🥅 Najviac gólov",
        cols: CURRENT_LANG === "en" ? "<th>Goals</th>" : "<th>Góly</th>",
      },
      assists: {
        list: "topAssists",
        title: CURRENT_LANG === "en" ? "🎩 Most assists" : "🎩 Najviac asistencií",
        cols: CURRENT_LANG === "en" ? "<th>A</th>" : "<th>A</th>",
      },
      points: {
        list: "topPoints",
        title: CURRENT_LANG === "en" ? "⚡ Most points" : "⚡ Najviac bodov",
        cols: CURRENT_LANG === "en" ? "<th>PTS</th>" : "<th>Body</th>",
      },
      plusminus: {
        list: "topPlusMinus",
        title: CURRENT_LANG === "en" ? "➕➖ Best +/-" : "➕➖ Najlepšie +/-",
        cols: "<th>+/-</th>",
      },
      pim: {
        list: "topPIM",
        title: CURRENT_LANG === "en" ? "⛓️ Most penalty minutes" : "⛓️ Najviac trestov",
        cols: "<th>PIM</th>",
      },
      toi: {
        list: "topTOI",
        title: CURRENT_LANG === "en" ? "🕒 Most TOI (min)" : "🕒 Najviac TOI (min)",
        cols: CURRENT_LANG === "en" ? "<th>MIN</th>" : "<th>Min</th>",
      },
      powerPlayGoals: {
        list: "topPowerPlayGoals",
        title: CURRENT_LANG === "en" ? "🥈 Most PP goals" : "🥈 Najviac PP gólov",
        cols: "<th>PP</th>",
      }
    };

    const sel = TYPES[type];
    if (!sel) {
      detail.innerHTML = `<p style="text-align:center;color:#aaa;">⚠️ ${CURRENT_LANG === "en" ? "Statistic is not available." : "Štatistika nie je dostupná."}</p>`;
      return;
    }

    players = data[sel.list] || [];
    title = sel.title;
    columns = sel.cols;

    if (!players.length) {
      detail.innerHTML = `<p style="text-align:center;color:#aaa;">${t("common.noData")}</p>`;
      return;
    }

    // 💎 Kompaktná tabuľka – žiadny min-width, všetko sa zmestí
    let html = `
      <h3 style="text-align:center;color:#00eaff;margin-bottom:10px;">${title}</h3>
      <table class="shooting-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t("table.player")}</th>
            <th>${t("table.team")}</th>
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
      detail.innerHTML = `<p style="text-align:center;color:#00eaff;">${t("common.loading")}</p>`;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });

      try {
        const now = Date.now();

        if (lastStats && now - lastFetchTime < 30000) {
          renderStats(lastStats, type);
          return;
        }

        let resp = await fetch("/api/statistics", { cache: "no-store" });
        if (!resp.ok) throw new Error(t("common.failedToLoad"));
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
// ABS toggle removed - all content is now displayed at once

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

  // 🔒 ZABEZPEČ, ŽE HAMBURGER BUTTON JE V HEADERI (NIE MIMO)
  const header = document.querySelector("header");
  const hamburgerButton = document.getElementById("mobileMenuToggle");
  if (header && hamburgerButton && hamburgerButton.parentElement !== header) {
    console.warn("⚠️ Hamburger button je mimo headeru! Presúvam ho do headeru...");
    header.insertBefore(hamburgerButton, header.firstChild);
  }

  // i18n init (static + long blocks)
  applyI18n();
  syncLangButtonsUI();

  document.getElementById("langBtnSk")?.addEventListener("click", () => {
    setLanguage("sk");
    syncLangButtonsUI();
  });
  document.getElementById("langBtnEn")?.addEventListener("click", () => {
    setLanguage("en");
    syncLangButtonsUI();
  });

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
      alert(t("premium.loginNeed"));
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
        alert(data?.error_description || t("premium.loginFailed"));
        return;
      }

      localStorage.setItem("sb-access-token", data.access_token);
      localStorage.setItem("sb-refresh-token", data.refresh_token);

      // refresh premium UI
      checkPremiumStatus();

    } catch (e) {
      alert(t("premium.loginFailed"));
      console.error(e);
    }
  });

  // ===============================
  // PREMIUM – LOGOUT (priame)
  // ===============================
  document.getElementById("premium-logout-btn")?.addEventListener("click", () => {
    premiumLogout();
    checkPremiumStatus();
  });

  // ===============================
  // PREMIUM – LOGOUT z locked boxu
  // ===============================
  document.getElementById("premium-logout-from-locked-btn")
    ?.addEventListener("click", () => {
      premiumLogout();
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
      msg.textContent = t("premium.fillAll");
      return;
    }

    if (pass !== pass2) {
      msg.textContent = t("premium.passMismatch");
      return;
    }

    msg.textContent = t("premium.registeringUser");

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
        msg.textContent = data?.error_description || data?.error || t("premium.signupFailed");
        return;
      }

      msg.textContent = t("premium.signupSuccess");

      // ⚠️ ak máš zapnuté email potvrdenie:
      // user sa NEPRIHLÁSI hneď
      // musí kliknúť na link v emaile

      // ak email confirmation NEMÁŠ:
      if (data.access_token) {
        localStorage.setItem("sb-access-token", data.access_token);
        localStorage.setItem("sb-refresh-token", data.refresh_token);
        checkPremiumStatus();
      } else {
        msg.textContent += t("premium.checkEmailConfirm");
      }

    } catch (e) {
      console.error(e);
      msg.textContent = t("premium.registerError");
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

  // ===============================
  // 🎬 SCROLL REVEAL ANIMÁCIE
  // ===============================
  initScrollAnimations();
});

// Globálny Intersection Observer pre scroll reveal
let scrollObserver = null;

// Funkcia pre inicializáciu scroll reveal animácií
function initScrollAnimations() {
  // Vytvor observer len raz
  if (!scrollObserver) {
    const observerOptions = {
      root: null, // viewport
      rootMargin: '0px 0px -50px 0px', // spustí animáciu 50px pred vstupom do viewportu (bližšie)
      threshold: 0.05 // spustí keď je 5% viditeľné (skôr)
    };

    scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animated');
          // Odstráň observer po animácii (performance)
          scrollObserver.unobserve(entry.target);
        }
      });
    }, observerOptions);
  }

  // Selektory pre elementy, ktoré sa majú animovať
  // BOXY MAJÚ PRIORITU - animujú sa postupne
  const boxSelectors = [
    '.matches-box',
    '.standings-box',
    '.home-panel',
    '.premium-section-card',
    '.analytics-box',
    '.stat-box',
    '.abs-info-box',
    '.abs-profit-box',
    '.vip-tip-card',
    '.vip-tip-row',
    '.matches-list',
    '.standings-wrapper',
    '.home-container',
    '.hero-banner',
    '.hero-content',
    'table tbody tr',
    '.nhl-home section'
  ];

  // Nadpisy a sekcie (menej priorita)
  const headerSelectors = [
    '.section-title',
    'h2',
    'h3',
    '.box-title'
  ];

  // Animuj boxy s postupným staggered efektom
  let boxIndex = 0;
  boxSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el) => {
      // Preskoč ak už má triedu
      if (el.classList.contains('animate-on-scroll')) return;
      
      el.classList.add('animate-on-scroll');
      
      // Postupný staggered efekt pre každý box
      const staggerClass = `stagger-${(boxIndex % 6) + 1}`;
      el.classList.add(staggerClass);
      boxIndex++;
      
      // Pridaj do observera
      scrollObserver.observe(el);
    });
  });

  // Animuj nadpisy (menej oneskorenie)
  headerSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.classList.contains('animate-on-scroll')) return;
      
      el.classList.add('animate-on-scroll');
      el.classList.add('stagger-1'); // Kratšie oneskorenie pre nadpisy
      
      scrollObserver.observe(el);
    });
  });

  // Pre elementy, ktoré sú už viditeľné pri načítaní (napr. domovská stránka)
  // Spusti animáciu okamžite
  setTimeout(() => {
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
      if (isVisible && !el.classList.contains('animated')) {
        el.classList.add('animated');
      }
    });
  }, 100);
}

// Funkcia pre aplikovanie animácií na nové dynamicky vytvorené elementy
function animateNewElements(container) {
  if (!scrollObserver) return;
  
  const boxSelectors = [
    '.home-panel',
    '.matches-box',
    '.standings-box',
    '.premium-section-card',
    '.analytics-box',
    '.stat-box',
    '.vip-tip-card',
    '.vip-tip-row',
    '.matches-list',
    '.standings-wrapper',
    'table tbody tr',
    '.nhl-home section'
  ];
  
  let boxIndex = 0;
  boxSelectors.forEach(selector => {
    const elements = container.querySelectorAll(selector);
    elements.forEach((el) => {
      if (el.classList.contains('animate-on-scroll')) return;
      
      el.classList.add('animate-on-scroll');
      
      // Postupný staggered efekt pre každý box
      const staggerClass = `stagger-${(boxIndex % 6) + 1}`;
      el.classList.add(staggerClass);
      boxIndex++;
      
      scrollObserver.observe(el);
      
      // Ak je už viditeľný, animuj okamžite
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        setTimeout(() => el.classList.add('animated'), 100);
      }
    });
  });
}
