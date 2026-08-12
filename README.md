# fit.sofaking.rocks

Joey's personal fitness/health toolkit. Static site, served by [SWAG](https://github.com/linuxserver/docker-swag)
(nginx reverse proxy) on Unraid — no backend, no database. All app state
(checkmarks, custom exercises, day/exercise edits) lives in the browser via
`localStorage`.

**Pages:**
- `/` — landing page, links to everything below
- `/workout/` — Push/Pull/Legs tracker (classic, read-only split)
- `/workout2.0/` — editable tracker: add/remove exercises and days, reorder,
  copy exercises between days, per-exercise weight tracking
- `/labs/` — Dirt Cheap Labs bloodwork panels + pricing comparison
- `/protocols/` — peptide dosing references and write-ups

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
