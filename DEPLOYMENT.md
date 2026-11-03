# Vercel deployment

Production uses Vercel Hobby and Neon Free. The local Python backend remains available for local development; it is excluded from Vercel uploads. Production requests go to `api/ledger.js`, using the shared scoring/ledger service and a Postgres adapter.

Public visitors can read sessions and player statistics, create sessions, and record games in non-imported sessions. Editing saved games and registering players require the owner password. The password is randomly generated with 256 bits of entropy, and its SHA-256 digest and an independent session signing secret are stored as sensitive Vercel environment variables. Browser sessions use a signed, seven-day, HttpOnly/Secure/SameSite cookie. All writes require a matching Origin. Only POST requests that create sessions or record games are allowed for guests; other writes require owner authentication. Missing configuration fails closed.

The owner's private password is saved locally in `.vercel/owner-password.txt`, which is excluded from uploads and Git. Do not share it. Password rotation requires replacing `OWNER_PASSWORD_HASH` and `OWNER_SESSION_SECRET` and redeploying.

Database tables retain import provenance. Public responses omit source audit records. Game edits retain the old record in `game_edits`; revision checks prevent stale edits overwriting newer changes. Host chips remain separate from mahjong points.

Initial migration: 44 players, 104 sessions, 817 games. `cloudflare/export_ledger.py` creates a normalized snapshot under ignored `cloudflare/.generated/`; `server/migrate.mjs` imports it transactionally into an empty Postgres database and refuses a second import. After launch, the cloud database is the live ledger; local JSON is not synchronized automatically. Do not rerun the importer against a populated database.

Validation: `npm run build`, `node --test server/*.test.js cloudflare/worker.test.js src/playerStats.test.js`. The tests include full migration into an in-memory Postgres runtime, score parity with historical records, owner authentication, rejected anonymous writes, edit auditing and stale revision rejection.

To deploy later changes: `npx vercel deploy --prod`. Stay on Hobby and the database Free plan; no paid upgrade was selected. Cloudflare files are retained as an alternative deployment implementation, but Cloudflare was not published.
