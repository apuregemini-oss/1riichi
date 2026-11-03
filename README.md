# Riichi Night Ledger

A compact, responsive home riichi ledger inspired by Chippirats. Live at https://1riichi.vercel.app. React + Vite frontend, Vercel serverless API, and Neon Postgres storage. A FastAPI backend with JSON storage is also available for local development.

## Features

- Session creation with a dollars-per-1,000-points selector (default $0.50), editable rules, and calculated oka.
- Persistent session list and four-player game recording with score-total validation and shared placements for ties.
- Player registration, duplicate detection, and roster search.
- Live lifetime-points leaderboard, refreshed every 10 seconds and on tab focus.
- Player profiles open in a new tab with recent trends, complete expandable history, average placement, average points, win rate, and best game.
- Light and dark themes. Existing players and earlier games remain available.

Production sessions and games are saved in Neon Postgres. Everyone can view the ledger; the owner signs in to add or edit games. Local development uses `data/store.json`, created automatically on first run. See [DEPLOYMENT.md](DEPLOYMENT.md) for hosting and authentication details.

## Run locally

Install frontend dependencies with `npm.cmd install`. Install Python requirements using your Python environment (`python -m pip install -r requirements.txt`).

Run the backend: `python -m uvicorn api.index:app --host 127.0.0.1 --port 8000`.
Run the frontend: `npm.cmd run dev -- --host 127.0.0.1`.
Open http://127.0.0.1:5173.

This checkout also has dependencies installed in `.runtime-deps`. To use them in PowerShell, set `$env:PYTHONPATH = Join-Path (Get-Location) '.runtime-deps'` before running Python. The bundled Python executable is `C:\Users\apure\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.

## Verification

- `npm.cmd run build`
- `python -m unittest api.test_sessions -v` (uses a temporary store, never modifies your saved ledger)

Reference exploration covered home navigation, preset selection, custom options, additional preset visibility, player registration UI, and chip count changes. The reference session list stayed on Loading during inspection. No players or sessions were created on the reference site.

Local browser checks covered preset values, player filtering, chip balance/persistence, and phone-width rendering. Backend tests cover session persistence, oka, custom score totals, ties, invalid names/uma, duplicate players, and legacy data normalization.

The local JSON store is intended for a single local backend process. Production uses durable Postgres storage and server-enforced owner authentication.

## Host fee

Game entry defaults to Eric C as host when he is one of the four selected players. Choose a different seated host or select No host fee. Saving a game records a five-chip debit for the winner and credit for the host; a host win records zero. For tied top scores, select the table's tie-break winner for this fee; shared placement points are unchanged.

Each saved game shows its host-fee receipt. Session host-fee totals are derived from saved games, so reloads do not apply fees again. Earlier games without a host remain unchanged. These totals track host-fee adjustments only and remain available after removal of the standalone Chip Counter.

Host-fee verification: eight backend tests passed; temporary-store browser checks confirmed the default Eric C selection, winner-to-host fee, host-win exemption, and persisted receipts after reload.

## Player statistics

Lifetime rankings sum saved final mahjong points across sessions and earlier games. Host-fee chips stay separate. Equal points share a rank; players without games are unranked. Tied placements use their shared numeric placement; win rate counts outright first places. Profiles show the latest 20 games in the trend chart and all game history in expandable batches of 20.

Stats checks: `node --test src/playerStats.test.js`. Browser checks verified new-tab links, direct profile reload, expandable history, automatic refresh, and phone layout without horizontal overflow.

## Workbook history import

Imported 89 populated session sheets and 714 games from the full Stefan Made Simple workbook, covering September 8, 2023 through October 25, 2026. The template and four empty sheets were skipped. The existing game was preserved, giving 715 games total. Historical records contain final points, not raw scores; they remain read-only and participate in rankings, trends, and placement statistics.

The import restores each game's actual winner deduction (0, 10, or 15 points), then separately records a five-chip winner-to-Eric C host fee, waived when Eric wins. Approved source corrections: January 7, 2023 becomes January 7, 2024; Kakizaki's 8.11 on February 8, 2026 game 7 becomes 8.1. Original source values and sheet/cell references are retained. Eric and Eric C are combined, as are 柿崎 and Kakizaki.

`imports/import-audit.json` records validation and corrections. A timestamped `data/store-before-history-*.json` backup preserves the pre-import ledger. The importer uses deterministic IDs to avoid duplicate imports and verifies source totals and zero-sum corrected games before saving. Reproduce a preview with `python imports/import_history.py --restore-actual --fix-typos`; add `--apply` to save.

Import checks: `python -m unittest api.test_sessions api.test_history_import -v` (14 tests), the five player-statistics tests, and the production frontend build passed.

## Chippirats export

Imported the Desktop `eric-c-games.csv` export: 114 new games in 18 sessions. Matched 22 existing games by local date, canonical player IDs, and raw scores. Excluded all four games in the June 24, 2024 session as requested. Original CSV results, including chips and winnings, remain in each new game's source metadata. Displayed points use 30/10 uma and 20 oka; nine games originally using zero oka were recalculated. Host fees are separately recorded as five chips to Eric C unless he wins. Session IDs preserve export grouping, including games crossing midnight; dates use America/Chicago.

Confirmed aliases: Alan O → Alan; Jimmy Sun/Jimmy S → Jimmy; Matsumoto K → Kazuma; Ueda → 上田; Laura K → Laura; Mark K → Mark; Eric N. → Eric N. Steve remains separate from Steven. Run `python imports/import_chippirats.py imports/eric-c-games.csv` for a preview, adding `--apply` to save with a backup. Tests: `python -m unittest api.test_chippirats_import -v`.

## Source repository

Credentials, local game data, exports, backups, and generated snapshots are excluded from Git. A fresh checkout starts with an empty local ledger. Historical import tests and full-ledger migration tests require the private source files and normalized snapshot; they are not included in the repository. Self-contained checks: `npm run build`, `node --test src/playerStats.test.js server/owner-auth.test.js`, and `python -m unittest api.test_sessions`.
