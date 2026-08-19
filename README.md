# Workout Tracker

Joey's workout tracker. Static site, served by [SWAG](https://github.com/linuxserver/docker-swag)
(nginx reverse proxy) on Unraid — no backend of any kind.

**Pages:**
- `/workout3.0/` — cloud-synced tracker: Google sign-in, weight history log,
  chart, CSV export. Synced directly to the signed-in user's own Google
  Drive `appDataFolder`, end-to-end encrypted with a passphrase-derived key
  before it ever leaves the browser — no server involved at all
- `/workout3.0/history.html` — weight history table + Chart.js graph + export
- `/workout2.0/` — editable tracker (local-only): add/remove exercises and
  days, reorder, copy exercises between days, per-exercise weight tracking
- `/workout/` — Push/Pull/Legs tracker (classic, read-only split)

All app state for `/workout/` and `/workout2.0/` lives in the browser via
`localStorage`. `/workout3.0/` syncs to Google Drive when signed in, and
falls back to `localStorage` when signed out.

---

## Deployment

Hosted at `/mnt/user/appdata/swag/fit.sofaking.rocks` on the Unraid box,
bind-mounted into the `swag` container at `/config/fit.sofaking.rocks`. Site
conf: `/config/nginx/proxy-confs/fit.sofaking.rocks.subdomain.conf`.

```
git clone https://github.com/southsko/workout-tracker.git
```

Files are copied/edited directly on the host; no build step.

Note: the live host directory also contains other pages for the same domain
(landing page, labs, protocols, shopping) that are intentionally **not**
tracked in this repo — this repo is scoped to the workout tracker only.

---

## Changelog

### 2026-08-11

#### Added

- **Workout Tracker (classic)** (`/workout/`) — Push/Pull/Legs split with
  tap-to-check sets, per-day time totals, `localStorage`-backed checkmarks
  (`ppl-done` key).
- **Workout Tracker 2.0** (`/workout2.0/`) — fully editable fork:
  - Add exercises from a curated ~85-entry catalog (grouped by muscle group,
    modeled on standard commercial-gym/24 Hour Fitness equipment)
  - Add/remove days, remove exercises, copy exercises between days
  - Pre-seeded with the classic tracker's Push/Pull/Legs data
  - State persisted under `workout2-state` in `localStorage`
- **Per-exercise weight field** on Workout 2.0, with a `localStorage`
  migration to strip stale weight text that had leaked into exercise names.
- **Exercise reordering** on Workout 2.0 — ▲/▼ buttons per row, persisted
  locally.

### 2026-08-12

#### Added

- **GitHub repo** — published to `southsko/fit.sofaking.rocks` (private).

### 2026-08-14

#### Added

- **Workout Tracker 3.0** (`/workout3.0/`) — forked from 2.0, adds:
  - Google sign-in (Google Identity Services) — any Google account, backend
    verifies the ID token and issues a signed session cookie
  - Cloud sync — plan (`days`/`exercises`/`checked`) persisted server-side
    per account instead of `localStorage`; falls back to local storage when
    signed out
  - "Import local" control — one-click, confirms before replacing your cloud
    plan with whatever plan is saved on the current device/browser; also
    logs every weight on that plan into history
  - Automatic weight history logging — every weight edit upserts a
    `(date, exercise)` row server-side, so retyping the same day updates one
    row instead of duplicating
  - PWA manifest for "Add to Home Screen" (`manifest.json`, `icon.svg`)
- **History page** (`/workout3.0/history.html`) — table of logged weights,
  per-exercise filter, CSV export, and a Chart.js line chart (auto-selects
  the most-logged exercise on load)
- **`fit-api` backend** — new service, separate repo
  ([`southsko/fit-api`](https://github.com/southsko/fit-api)): Python
  FastAPI + SQLite, Docker container `fit-api` on the shared `proxy` network,
  reverse-proxied at `fit.sofaking.rocks/api/*` via a `location /api/` block
  added to `fit.sofaking.rocks.subdomain.conf`.

#### Fixed

- Import/dismiss controls on the plan-import banner were silently inert —
  `bar.hidden = true` was overridden by an unconditional `display:flex` rule
  on the same class (classic `[hidden]`-vs-CSS-specificity gotcha).
- An early caching service worker made the page appear permanently stuck on
  stale content; replaced with a network-first strategy, then removed
  entirely in favor of a one-time "kill switch" script (self-unregisters,
  clears its own cache) once it was clear the added complexity wasn't
  earning its keep.
- Cloudflare (in front of the whole domain) was edge-caching
  `service-worker.js` for 4 hours regardless of origin headers — the actual
  root cause of "hard refresh fixes it, normal refresh doesn't." Added an
  explicit `no-cache` header for that file at the nginx layer and purged the
  edge cache.
- `/api/*` requests 404'd/500'd through two rounds of nginx `proxy_pass`
  gotchas — variable-based `proxy_pass` doesn't strip the location prefix
  like a static one does, and a `rewrite ... break;` silently skips any
  `set` directives written after it in the same location block. Settled on
  giving the FastAPI routes an `/api` prefix instead of fighting nginx.
- History chart never rendered by default (only appeared after manually
  picking an exercise from an empty-by-default dropdown); now auto-selects
  the most-logged exercise on page load.

### 2026-08-18

#### Changed

- **Repo scope narrowed** — this repo now tracks only the workout tracker
  (`/workout/`, `/workout2.0/`, `/workout3.0/`). The landing page, labs,
  protocols, and shopping pages remain on the live host but are no longer
  pushed to GitHub.

### 2026-08-19

#### Changed

- **Moved off `fit-api` entirely — no backend of any kind now.**
  `/workout3.0/` used to sync through a self-hosted FastAPI + SQLite
  container. It now talks straight to the signed-in user's own Google Drive
  `appDataFolder` from the browser (`workout3.0/drive-sync.js`), the same
  shape as any other static page here. The `fit-api` container, its nginx
  `/api/` proxy, and its GitHub repo are retired.
- **Data is end-to-end encrypted.** Both the plan and the weight history are
  AES-256-GCM encrypted with a passphrase-derived key before they ever leave
  the browser, so Drive (and anyone holding only the OAuth token) sees
  ciphertext only. First-time setup now asks for the passphrase twice and
  rejects a mismatch, since a typo here is unrecoverable by design — there
  is no reset path.
- **Repo renamed and made public** — `southsko/fit.sofaking.rocks` is now
  [`southsko/workout-tracker`](https://github.com/southsko/workout-tracker),
  public. Old commit history was rewritten to remove a Cloudflare API token
  that had been committed by accident (never reached GitHub before the
  rewrite).
- **Personal branding removed** — page titles across `/workout/`,
  `/workout2.0/`, `/workout3.0/` no longer say "Joey," now that the repo is
  public under its own name.
