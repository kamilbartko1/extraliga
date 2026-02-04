# Daily 1X2 Tips Game

## Overview

The tips game lets users submit 1X2 predictions (1 = home win, X = draw/OT, 2 = away win) for today's NHL games. Tips are evaluated daily against real results. User stats and recent history are available in the dashboard.

## Redis Data Model

| Key | Value |
|-----|-------|
| `tips:{YYYY-MM-DD}:{userId}` | JSON array of `{ gameId, pick }` |
| `tips_results:{YYYY-MM-DD}` | JSON object `gameId → "1" \| "X" \| "2"` |
| `tips_user_stats:{userId}` | JSON `{ totalPredictions, correctPredictions, accuracy, lastUpdated }` |
| `tips_users_by_date:{YYYY-MM-DD}` | Set of userIds who submitted tips |

All dates use **Europe/Bratislava** timezone.

## Backend Endpoints (all in `/api/vip.js`)

| Task | Method | Auth | Description |
|------|--------|------|-------------|
| `save_tips` | POST | Yes | Save tips. Body: `{ date?, tips: [{ gameId, pick }] }` |
| `user_tips_today` | GET | Yes | Return today's tips for current user |
| `evaluate_tips_yesterday` | POST | No (cron) | Evaluate yesterday's tips, update stats |
| `tips_dashboard` | GET | Yes | Return user stats + recent days |
| `tips_leaderboard` | GET | No (public) | Return ranked list of all tiper users |

| Redis | Description |
|-------|--------------|
| `tips_leaderboard_users` | Set of userId who ever submitted tips (SADD on save_tips and in evaluate_tips_yesterday) |

## Tips Leaderboard – logika poradia

Rebríček **nie je** zoradený podľa percentuálnej úspešnosti, pretože by to bolo neférové: niekto môže tipovať len jeden deň s 2 zápasmi, oba uhádnuť (100 %) a potom sa neúčastniť – tak by bol „najlepší“. Preto:

1. **Primárne kritérium:** **Počet správnych tipov** (correctPredictions) – zostupne. Kto má viac správnych tipov, je vyššie.
2. **Rozhodovacie kritérium:** **Úspešnosť v %** (accuracy) – zostupne. Pri rovnakom počte správnych tipov vyhráva ten s vyššou percentuálnou úspešnosťou.

Takže „najlepší tiper“ je ten, kto má **najviac správnych tipov**; pri rovnosti rozhoduje **vyššia úspešnosť**. Napr. 35 správnych z 50 (70 %) je pred 2 správnymi z 2 (100 %), lebo 35 > 2. Súťaž tak odráža aj objem (počet tipov) aj kvalitu (úspešnosť).

## Evaluation Rules (1X2)

- **X** = Game went to OT or SO (`gameOutcome.lastPeriodType` = OT/SO)
- **1** = Home won in regulation
- **2** = Away won in regulation

## Scheduler (Vercel Cron)

The cron job in `/api/cron.js` runs at **07:XX UTC** (~08:XX Europe/Bratislava) and calls:

```
POST /api/vip?task=evaluate_tips_yesterday
```

## Frontend Flow

1. **Homepage** – 1X2 buttons for each game; CTA "Odoslať tipy"
2. **Logged-out** – Click CTA → redirect to login (Premium section)
3. **Logged-in** – Submit tips via `POST /api/vip?task=save_tips`
4. **Pre-fill** – On load, `GET /api/vip?task=user_tips_today` pre-fills saved picks
5. **Leaderboard** – V dashboarde tipov tlačidlo „Leaderboard tipov“ scrollne na tabuľku rebríčka; dáta z `GET /api/vip?task=tips_leaderboard` (verejné, voliteľný token pre zvýraznenie „TY“).
