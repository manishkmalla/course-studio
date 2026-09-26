# Course Studio

## What it is and why

_TODO: fill in once features exist._

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

## Architecture and how lost updates are prevented

_TODO: fill in once course editing exists (optimistic locking via the
`version` column on `courses`, and why)._

## How to run tests

```bash
docker compose exec api npm test
docker compose exec api npm run typecheck
docker compose exec web npm run typecheck
docker compose exec web npm run build
```

## Known issues and cuts

- Phase 1 only: scaffolding, health check and seed data. No auth, course
  editing, or learner-facing features yet.

## What I'd do with more time

_TODO._

## How AI tools were used

Built with Claude Code (Anthropic), following the constraints and rules in
`.claude/CLAUDE.md`.
