# Wind Forecast Monitor

A web app for a UK energy supplier's day-ahead trading team. It answers two questions about GB national wind generation in January 2026:

1. **What did the latest wind forecast say when we had to make our purchase decision?**
2. **How accurate are those forecasts, so we can size the error into our decisions?**

Data comes from the Elexon BMRS API: actual generation from [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) (`fuelType = WIND`) and forecasts from [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).

**Live app:** https://wind-forecast-monitor-sandy.vercel.app

## Key findings (January 2026)

| Horizon | Typical error (MAE) | 90% of hours within | Average bias |
|---|---|---|---|
| 1h ahead | 1,801 MW (16.5%) | ± 3,798 MW | +1,596 MW |
| 24h ahead | 2,050 MW (20.5%) | ± 4,129 MW | +1,854 MW |
| 48h ahead | 2,380 MW (25.9%) | ± 4,744 MW | +1,879 MW |

- Error grows steadily with forecast horizon.
- Forecasts were **consistently too high** (by ~1.6–1.9 GW). Taking them at face value means under-buying. A likely cause is that FUELHH measures metered output after curtailment while the forecast reflects available wind; this is a hypothesis, not verified.

## Features

- **Decision view:** pick a decision time and see the newest forecast published by then, the delivery-day outlook, and a 90% uncertainty band derived from January's errors at the same horizon.
- **Accuracy analysis:** a horizon slider (0–48h) and date range drive MAE / P90 / bias / MAPE tiles, an actual-vs-forecast chart, an error-by-horizon chart, and an error histogram.
- Every chart has a data-table view; light and dark themes; colour-blind-safe palette.
- **Accounts:** register and log in with email and password. The data API requires a JWT bearer token; logging out discards it.

## Authentication

- `POST /api/auth/register` creates the account; the user then logs in. `POST /api/auth/login` returns a signed JWT (HS256), which the frontend keeps in `localStorage` and sends as `Authorization: Bearer …`. The data endpoints return 401 without a valid token, and the frontend then returns to the login page.
- Passwords are hashed with scrypt (Python standard library) and a per-user salt.
- Tokens are stateless: logging out deletes the token in the browser, and a copied token stays valid until it expires (`JWT_TTL_HOURS`, default 12).

Configuration, all optional locally (see [.env.example](.env.example)):

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Key that signs tokens, at least 32 characters. **Required on Vercel.** If unset locally, a random one is used and logins end on restart. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `JWT_TTL_HOURS` | Token lifetime in hours (default 12) |
| `DATABASE_URL` | User database. Default: SQLite at `backend/users.db` (Docker: a `users` volume). On Vercel use Postgres (e.g. Neon or Vercel Postgres): the filesystem there does not persist |

## How forecasts are chosen

For a target hour *T* and horizon *H*, the app uses the **latest forecast whose `publishTime` ≤ *T* − *H***, i.e. what a trader could actually have seen *H* hours earlier. Rows where `publishTime` is after `startTime` are not forecasts and are dropped. Forecasts are hourly and actuals half-hourly, so errors are measured on the hour.

## Running the app

### With Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost:3000. Use another port with `PORT=4000 docker compose up`. To keep logins across restarts, copy `.env.example` to `.env` and set `JWT_SECRET`.

### Without Docker

Requires Python 3.12+ and Node 20+.

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload   # http://localhost:8000/docs for API docs
                                # add --env-file .env to load JWT_SECRET etc. from backend/.env

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### Tests and checks

```bash
cd backend && python -m pytest        # unit + API tests
cd frontend && npm run lint && npm run build
```

### Data source

By default the backend reads a committed snapshot of January 2026 (`backend/data/elexon_jan2026.json`): it is historical data, so this is fast and works offline. Set `DATA_SOURCE=live` to fetch from Elexon instead. Refresh the snapshot with `python -m app.elexon` from `backend/`.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register` | Create an account (`{email, password}`, password ≥ 8 chars); then log in |
| `POST /api/auth/login` | Log in (`{email, password}`); returns a token |
| `GET /api/auth/me` 🔒 | The logged-in user |
| `GET /api/analysis?horizon=24&start=…&end=…` 🔒 | Actual vs horizon-selected forecast series, error metrics, coverage |
| `GET /api/horizon-curve` 🔒 | MAE / P90 / bias for every horizon 0–48h |
| `GET /api/forecast-run?as_of=…` 🔒 | Latest forecast run published by a decision time |
| `GET /api/health` | Health check |

🔒 requires `Authorization: Bearer <token>`. In `/docs`, use **Authorize** to paste a token from register/login.

Interactive docs at `/docs` when the backend is running.

## Files and directories

```
.
├── backend/                      Python API (FastAPI)
│   ├── app/
│   │   ├── main.py               API routes, validation, response models
│   │   ├── auth.py               Register/login, password hashing, JWT issue and check
│   │   ├── db.py                 User accounts table (SQLAlchemy; SQLite or Postgres)
│   │   ├── elexon.py             Elexon client, parsing, snapshot load/save
│   │   ├── forecasts.py          Horizon-based forecast selection, series building
│   │   └── metrics.py            Error metrics (MAE, RMSE, bias, MAPE, percentiles)
│   ├── data/elexon_jan2026.json  Snapshot of the January 2026 source data
│   ├── tests/                    pytest tests for parsing, selection, metrics, API
│   ├── requirements.txt          Runtime dependencies
│   ├── requirements-dev.txt      + test dependencies
│   └── Dockerfile
├── frontend/                     React + TypeScript (Vite)
│   ├── src/
│   │   ├── App.tsx               Login gate, page layout and state
│   │   ├── api.ts                API types, URL builders, login/register calls
│   │   ├── auth.ts               Session context and useAuth
│   │   ├── hooks.ts              useFetch (sends the token), useDebounced
│   │   ├── format.ts             Number/date formatting, axis ticks
│   │   ├── index.css             Design tokens (light/dark) and layout
│   │   └── components/           AuthPage, AuthProvider, Controls, StatTiles, SeriesChart,
│   │                             HorizonChart, ErrorHistogram, DecisionView, legend
│   ├── nginx.conf                Serves the build, proxies /api to the backend
│   └── Dockerfile                Multi-stage: Node build → nginx
├── api/index.py                  Vercel entry point: backend API + built frontend in one app
├── vercel.json                   Vercel build command and function bundle config
├── pyproject.toml                Python deps and entrypoint for Vercel
├── docker-compose.yml            Runs backend + frontend together
├── .env.example                  JWT and database settings
└── README.md
```

## Use of AI tools

This project was built with the help of **Claude Code** (Anthropic's AI coding assistant), used for exploring the Elexon API, writing code and tests, and reviewing the UI. All design choices, results and code were reviewed and verified by running the tests and the app against real data.
