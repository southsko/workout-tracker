# fit.sofaking.rocks

Joey's personal fitness/health toolkit. Static site, served by [SWAG](https://github.com/linuxserver/docker-swag)
(nginx reverse proxy) on Unraid — no backend, no database. All app state
(checkmarks, custom exercises, day/exercise edits) lives in the browser via
`localStorage`.

**Pages:**
- `/` — landing page, links to everything below
- `/workout3.0/` — cloud-synced tracker: Google sign-in, weight history log,
  chart, CSV export (backend: [`fit-api`](https://github.com/southsko/fit-api))
- `/workout3.0/history.html` — weight history table + Chart.js graph + export
- `/workout2.0/` — editable tracker (local-only): add/remove exercises and
  days, reorder, copy exercises between days, per-exercise weight tracking
- `/workout/` — Push/Pull/Legs tracker (classic, read-only split)
- `/labs/` — Dirt Cheap Labs bloodwork panels + pricing comparison
- `/protocols/` — peptide dosing references and write-ups
- `/shopping/` — supplies and gear lists (peptide shopping list)

---

## Deployment

Hosted at `/mnt/user/appdata/swag/fit.sofaking.rocks` on the Unraid box,
bind-mounted into the `swag` container at `/config/fit.sofaking.rocks`. Site
conf: `/config/nginx/proxy-confs/fit.sofaking.rocks.subdomain.conf` (serves
the whole folder as root — new subfolders work with zero nginx changes).

```
git clone https://github.com/southsko/fit.sofaking.rocks.git
```

Files are copied/edited directly on the host; no build step.

---

## Changelog

### 2026-08-11

#### Added

- **Site scaffolding** — new SWAG site-conf + vhost for `fit.sofaking.rocks`,
  static folder root at `/mnt/user/appdata/swag/fit.sofaking.rocks`.
- **Landing page** (`/`) — dark-theme index with card links, playful stats
  row, and footer (copyright, medical disclaimer, contact).
- **Workout Tracker (classic)** (`/workout/`) — Push/Pull/Legs split with
  tap-to-check sets, per-day time totals, `localStorage`-backed checkmarks
  (`ppl-done` key).
- **Workout Tracker 2.0** (`/workout2.0/`) — fully editable fork:
  - Add exercises from a curated ~85-entry catalog (grouped by muscle group,
    modeled on standard commercial-gym/24 Hour Fitness equipment)
  - Add/remove days, remove exercises, copy exercises between days
  - Pre-seeded with the classic tracker's Push/Pull/Legs data
  - State persisted under `workout2-state` in `localStorage`
- **Lab Tests** (`/labs/`) — panel cards for Dirt Cheap Labs' "The Works"
  (~$200, 53 markers) and "Hormone Essentials" ($80, 7 markers), plus an
  "About Dirt Cheap Labs" write-up and a price comparison vs. a real Ulta
  Wellness order.
- **Peptide Shopping List** link on the landing page (Amazon wishlist).
- **Per-exercise weight field** on Workout 2.0, with a `localStorage`
  migration to strip stale weight text that had leaked into exercise names.
- **Exercise reordering** on Workout 2.0 — ▲/▼ buttons per row, persisted
  locally.

### 2026-08-12

#### Added

- **Protocols page** (`/protocols/`) — dosing references: r/NTNPerformance
  peptide cheat sheet, peptidedosages.com, researchdosing.com. Linked from
  the landing page.
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
- **Landing page** — consolidated the three workout-tracker cards into one
  ("Workout Tracker 3.0" as the primary tap target), with a small
  "Old versions: 2.0 · classic" line inside the same card instead of two
  separate cards.

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

### 2026-08-15

#### Added

- **Shopping page** (`/shopping/`) — new category for gear/supply lists,
  starting with the Peptide Shopping List (Amazon wishlist), moved off the
  landing page and out to its own card-style page (same pattern as
  `/protocols/`).
