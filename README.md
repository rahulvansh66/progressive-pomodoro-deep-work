# Progressive Pomodoro

A focus timer for getting into **flow** and doing deep work, based on the method described in
[Progressive Pomodoro.md](Progressive%20Pomodoro.md): start with a tiny block, rate your focus,
skip the break if you're flowing, then adjust the next block's length. Every block is saved to a
local SQLite database, so you can track your focus by day, week, month and year and compare each
period with the one before it.

**Stack:** Python (FastAPI + SQLAlchemy + SQLite) · React + TypeScript (Vite, Recharts, Tailwind)

---

## Quick guide

### Timer (`/`)
1. **Pick a category and optional task**, then choose a block length. Start small: 2–5 minutes. The more resistance you feel, the shorter the block should be.
2. **Focus.** The ring counts down. When the planned time is up the timer **keeps counting up** (`+02:13`) instead of cutting you off, so you can stay in flow. Click **Finish block** when you're done.
3. **Rate your focus:** 😵 Distracted · 🙂 Okay · 🎯 Highly focused · 🔥 Flow. Add an optional note.
4. **Break or keep going.** If you rated *Flow*, the primary action is **Keep flowing**, which skips the break and starts the next block immediately. Otherwise you get a break timer (or you can skip it).
5. **Next block length is suggested from your rating** and you can adjust it with − / +:

   | Rating | Next block | Break |
   |---|---|---|
   | Distracted | ~60% of current (min 2) | yes |
   | Okay | same | yes |
   | Highly focused | +5 min | yes |
   | Flow | +10 min | skipped |

   The steps, minimum, maximum and break length are configurable under **Manage → settings**.

An in-progress block survives a page refresh (it's kept in your browser's local storage). Each finished block is saved to the database when you rate it.

### Dashboard (`/dashboard`)
- Switch between **Day / Week / Month / Year** and step through time with ◀ Today ▶.
- Filter everything by **category**.
- **Every figure is compared with the previous period** (yesterday, last week, last month or last year), shown as ▲/▼ with the percentage change: focus time, blocks, average and longest block, flow rate, average focus score, active days and goal days met.
- Charts:
  - focus minutes for this period (bars) overlaid with the previous period (dashed line)
  - time by category (donut) and category comparison with the previous period
  - focus rating distribution, current vs previous
  - top tasks
  - **block progression** for a day (planned length per block, coloured by rating) showing your start-small → flow curve
  - a year-long activity heatmap
- **Daily goal** progress and **goal streak** (consecutive days you hit your goal).

### Manage (`/manage`)
- **Categories** (with colour, archive, delete) and **tasks** inside each category (tick them off when done).
- **Daily focus goals**, either overall or per category. A new goal applies from today onward and past days keep the goal they had, so history isn't rewritten.
- **Progressive Pomodoro settings:** default start length, min/max block, increase steps, break length.

### History (`/history`)
Browse every block, filter by date range and category, fix a rating, edit a note or delete a block.

---

## Setup

**Prerequisites:** Python 3.11+ and Node.js 20+.

### 1. Backend (API on http://localhost:8000)

```bash
cd backend
python -m venv .venv

# activate the virtual environment
#   Windows (PowerShell):  .venv\Scripts\Activate.ps1
#   macOS / Linux:         source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

The SQLite database is created automatically as `backend/pomodoro.db` on first start. To use a different file, set `POMODORO_DB_URL` (e.g. `sqlite:///./other.db`). Interactive API docs are at http://localhost:8000/docs.

### 2. Frontend (http://localhost:5173)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend.

### Optional: demo data

To see the dashboard filled with about a year of sample focus blocks (run from `backend/` with the venv active):

```bash
python seed.py          # refuses to run if blocks already exist
python seed.py --reset  # wipes categories, tasks, goals and blocks first
```

### Tests

```bash
cd backend
pytest
```

Covers period boundaries (ISO weeks, month/year rollover, leap years), previous-period comparisons, goal history and streaks, the next-block rules and the API.

### Single-server production build

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app
```

When `frontend/dist` exists, FastAPI serves the app itself at http://localhost:8000, so no separate frontend server is needed.

---

## Project layout

```
backend/    FastAPI app (app/routers, app/services/stats.py, app/services/progression.py), seed.py, tests/
frontend/   Vite + React + TypeScript (src/pages: Timer, Dashboard, History, Manage)
Progressive Pomodoro.md   the method this app implements
```
