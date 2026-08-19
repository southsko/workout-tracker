# Workout 3.0 — Drive migration handoff

**Status as of 2026-08-18: deployed and live, mid-testing. `fit-api` is still
running as a safety net — not yet decommissioned.**

## What changed

Workout 3.0 (`/workout3.0/`) used to sync through a self-hosted backend
(`fit-api`: FastAPI + SQLite in Docker, reverse-proxied through SWAG at
`/api/*`). It's being migrated to store data directly in each signed-in user's
own **Google Drive appDataFolder** — no server of ours involved. Goal: delete
the Docker container, SQLite, and the nginx `/api/` proxy entirely, so
`/workout3.0/` goes back to being a pure static page (like `/workout/` and
`/workout2.0/`).

Data is also **client-side encrypted** (AES-256-GCM, passphrase-derived key)
before it ever reaches Drive — Joey's choice, traded off against "you can't
reset a forgotten passphrase."

## Architecture

- **`/workout3.0/drive-sync.js`** — shared module (used by both `index.html`
  and `history.html`) handling:
  - OAuth via `google.accounts.oauth2.initTokenClient` (scope
    `drive.appdata`), with the access token cached in `sessionStorage` so
    navigating between the two pages doesn't re-trigger Google's consent flow.
  - Drive REST calls (`findFileByName`, `createFile`, `readFileContent`,
    `updateFileContent`, `deleteFile`) against `www.googleapis.com` directly
    from the browser.
  - Passphrase → AES-GCM key derivation (PBKDF2, salt stored in
    `fit-meta.json`), with the derived key cached in `localStorage` after
    first entry so it's only asked for once per device.
  - `getJsonFile(name, seedFactory)` / `writeJsonFile(fileId, data)` —
    transparently encrypt/decrypt; `seedFactory` only runs the first time a
    file doesn't exist yet.
  - `migrationSeed()` — fetches `/workout3.0/migration-seed.json` once,
    shared by both pages' seed factories (see below).
- **Three files per user in their Drive appDataFolder** (hidden, not visible
  in their normal Drive UI):
  - `fit-state.json` — the plan (`{days, checked}`)
  - `fit-history.json` — weight log array (`{date, day_name, exercise_name,
    weight, sets_reps}`), upserted client-side by `(date, exercise_name)`
  - `fit-meta.json` — PBKDF2 salt (not secret, just needs to stay stable)
- **`GOOGLE_CLIENT_ID`, `STATE_FILE`, `HISTORY_FILE`, `META_FILE`** are all
  defined once in `drive-sync.js` — don't redeclare them in the page scripts,
  they share the global scope (classic `<script>` tags, not modules).

## One-time data migration

Joey's real plan + 13 history rows were dumped from `fit-api`'s SQLite DB
straight into `/workout3.0/migration-seed.json` (live host only — **gitignored**,
contains personal data, not committed). Both `index.html` and `history.html`
check this file before falling back to a blank seed, so whichever page
creates a Drive file first still gets his real data. **Delete
`migration-seed.json` from the host once his data is fully confirmed migrated
and stable** — it's a one-time bootstrap file, not meant to live forever.

## Known gotchas (already hit today — don't re-debug these)

- **Cloudflare caches `.js` files at the edge for hours by default**,
  independent of origin headers. `drive-sync.js` and `service-worker.js` both
  have an explicit nginx `no-cache` header block in
  `fit.sofaking.rocks.subdomain.conf` for this reason. **If any new shared
  `.js` file gets added to `/workout3.0/`, give it the same treatment** or
  edits will silently not take effect for visitors (`cf-cache-status: HIT`).
  Cache-purge token is `REDACTED-CLOUDFLARE-TOKEN`
  (cache_purge:edit scope only — can't create Cache Rules with it). Zone ID:
  `9ad11b8de59b12d96108ab079cf9e2a7`.
- **`google.accounts.id` (ID-token/One Tap) and `google.accounts.oauth2`
  (token client) are different flows** — this migration uses the latter
  (needed for the Drive scope). The consent screen is heavier than the old
  one-tap flow and shows a "Google hasn't verified this app" click-through.
  This does NOT cap who can sign in as long as the OAuth consent screen's
  publishing status is **"In production"** (the 100-user cap only applies to
  "Testing" status).
- **`currentUser` naming collision**: `drive-sync.js` uses `_currentUser`
  internally (exposed via `driveUser()`) specifically to avoid colliding with
  each page's own `let currentUser` — both scripts share one global scope.
- Passphrase is asked once per **file existence check**, not once per file —
  `unlockKey()` verifies a cached/entered key by test-decrypting
  `fit-state.json`, so a wrong passphrase fails cleanly instead of producing
  garbage.

## Still pending (do not do these until Joey explicitly confirms)

1. Confirm real end-to-end testing is fully clean: sign-in, passphrase set,
   data present, history populated, CSV export, sign-out/back-in with no
   re-prompt, wrong-passphrase handling.
2. Delete `/workout3.0/migration-seed.json` from the host once confirmed.
3. **Decommission `fit-api`** (destructive — confirm with Joey immediately
   before doing this):
   - `docker compose down` in `/mnt/user/appdata/fit-api`
   - Remove the `location /api/` block from
     `fit.sofaking.rocks.subdomain.conf`, `nginx -t` +
     `docker exec swag nginx -s reload` (never restart/recreate `swag`)
   - Leave `/mnt/user/appdata/fit-api` and its local (never-pushed to GitHub —
     repo creation was blocked by the sandbox classifier) git repo on disk;
     ask Joey whether to delete or keep
   - Update `fit.sofaking.rocks/README.md` changelog noting the backend
     removal
4. Commit + push the `workout3.0/` changes to `southsko/fit.sofaking.rocks`
   (repo is already scoped to just the tracker; nothing committed yet from
   this migration as of writing this handoff).

## Full plan file

The original implementation plan (architecture rationale, encryption design
discussion, decommission steps) is at
`/root/.claude/plans/can-we-fork-the-stateful-badger.md` if more detail is
needed than this summary.
