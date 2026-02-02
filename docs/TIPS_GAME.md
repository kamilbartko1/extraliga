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
