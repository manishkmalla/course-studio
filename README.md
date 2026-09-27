# Course Studio

## What it is and why

A small full-stack app for building and taking short online courses.
Creators write courses made of ordered text lessons and publish them;
learners browse published courses, work through the lessons and track their
progress; creators see simple completion stats. All creators share one
workspace and can edit any course, so the app has to handle two people
having the same course open at once without silently losing either person's
edits — that guarantee is the main thing this codebase is built around.

## Quick start

```bash
docker compose up --build
```

No `.env` file is required — dev defaults live in `docker-compose.yml`.

- Web: http://localhost:5173
- API: http://localhost:3000

To wipe the database and start fresh:

```bash
docker compose down -v
docker compose up --build
```

## Demo credentials

Password for all seeded accounts: `Demo123!`

- `creator1@demo.test`, `creator2@demo.test` — role `creator`
- `alice@demo.test`, `bob@demo.test` — role `learner`

## Architecture

- `api/`: Node + Express 5 + TypeScript (strict), Zod 4 for input validation,
  Drizzle ORM over Postgres. Routes (`src/routes/`) only validate and shape
  HTTP responses; business logic and transactions live in `src/services/`.
- `web/`: React + Vite + TypeScript, Tailwind CSS + shadcn/ui, no router
  library — navigation is plain `useState` (list vs. editor/player per
  area). All requests go through `src/lib/api.ts`.
- `db`: Postgres 16 in Docker Compose.

## How lost updates are prevented

Every course has a `version` column. The editor loads a course together
with its version; saving sends that version back. The save runs one
transaction: `UPDATE courses SET ..., version = version + 1 WHERE id = $id
AND version = $version RETURNING *`. If no row comes back, either the course
doesn't exist (404) or someone else already saved a newer version (409) — a
concurrent `UPDATE` targeting the same row blocks on Postgres's row lock
until the winner commits, then re-checks its `WHERE version = $version`
against the now-current row and finds no match. On a 409 the API returns the
current course (with its lessons) so the UI can offer **Load latest**
(discard local edits) or **Overwrite with mine** (re-save local edits on top
of the current version). This is optimistic, not pessimistic, locking on
purpose: a lock can't be held across the GET that loads the editor and the
PUT that saves it later, since those are separate requests — the only lock
that matters is the brief one inside the save transaction itself.

Renumbering lesson positions on save (insert/update/delete/reorder in one
request) is done in two steps inside the same transaction — negate the kept
lessons' positions first, then assign final positions — to avoid transiently
colliding with the `unique(course_id, position)` constraint. See the
comments in `api/src/services/courses.ts` for the exact sequence.

## How to run tests

```bash
docker compose exec api npm test
docker compose exec api npm run typecheck
docker compose exec web npm run typecheck
docker compose exec web npm run build
```

## Troubleshooting

- **Host `npm ci` fails with `EACCES`**: running `docker compose up` first
  creates `api/node_modules` and `web/node_modules` on the host as `root`
  (they're anonymous-volume mount points). A later host-run `npm ci` then
  can't write to them. Either run commands inside the containers
  (`docker compose exec api ...` / `docker compose exec web ...`, the
  normal way to run tests and typecheck — see above) or delete those
  folders with `sudo` before installing on the host.
- **A service still uses old dependencies after `docker compose up --build -V`**:
  `-V` only recreates *anonymous* volumes; the `api-node-modules` and
  `web-node-modules` volumes in `docker-compose.yml` are *named*, so they
  survive `-V` and can keep serving a stale `node_modules` after a
  `package.json` change. Force it by removing that service's container and
  named volume together, then recreating it:

  ```bash
  docker compose rm -sf web && docker volume rm course-studio_web-node-modules
  docker compose up --build -d web
  ```

  (swap `web` for `api` if it's the API's dependencies that changed).

## Known issues and cuts

- No frontend automated tests (per CLAUDE.md's scope — API has the full
  Vitest/Supertest suite, including the concurrency test).
- No router library — the app is a single page with local view state, so
  there are no shareable/bookmarkable URLs for a specific course or lesson.
- Intentionally out of scope, per CLAUDE.md: rich text, images/uploads,
  lesson drag-and-drop reordering (lessons reorder via up/down buttons
  instead), real-time collaboration, draft/published version snapshots,
  organisations or teams.
- Any creator can edit or publish any course — there's no per-creator
  ownership restriction, matching the shared-workspace model this app
  targets.

## What I'd do with more time

- Automated frontend tests (component/interaction tests for the conflict
  flow in particular, since it's the trickiest UI state).
- Drag-and-drop lesson reordering.
- A toast/notification system instead of inline alerts, so errors and the
  save-conflict prompt are harder to miss regardless of scroll position.
- Debounced autosave instead of an explicit Save button, with the same
  version-conflict handling underneath.

## How AI tools were used

Built with Claude Code (Anthropic) across four phases (scaffolding, auth,
courses/concurrency, UI), with `.claude/CLAUDE.md` as the source of truth
for constraints and conventions. Schema, auth and the course-save
transaction were planned and approved before any code was written, per the
working agreement in CLAUDE.md; every phase's tests and typecheck were run
for real before being reported as passing.
