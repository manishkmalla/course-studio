# CLAUDE.md — Course Studio

## What this is

A small full-stack app for building and taking short online courses. Creators
write courses made of ordered text lessons and publish them; learners browse
published courses, work through the lessons and track their progress; creators
see simple completion stats. Clarity beats cleverness everywhere.

**The one invariant that matters:** a course save must never silently
overwrite someone else's changes. All creators share one workspace and can
edit any course, so two people can have the same course open at once. Saves
use optimistic concurrency: every save sends the `version` it was based on,
and a save based on a stale version is rejected with 409. Any change that
touches course editing must preserve this and keep its test passing.

## Constraints and priorities

- Keep scope small. Prefer the smallest change that works. Do not add
  features, libraries, abstractions or tooling that weren't asked for. If
  something would take more than ~20 minutes, say so and propose a cut.
- Priority order: (1) standard flows work on a fresh clone, (2) the
  optimistic-concurrency guarantee is correct and tested, (3) clear README,
  (4) everything else.
- Write conventional, readable code that is easy to follow and change:
  no metaprogramming, no generic "frameworks", no premature layering. Add
  short comments explaining *why*, especially in the course save transaction.
- Out of scope (do not build unless asked): rich text, images or uploads,
  lesson drag-and-drop reordering, real-time collaboration, draft/published
  version snapshots, organisations or teams.

## Stack

- `api/`: Node 24, TypeScript (strict), Express 5, Zod 4, Drizzle ORM + `pg`,
  bcryptjs, jsonwebtoken, cookie-parser
- `web/`: React + Vite + TypeScript, Tailwind CSS, shadcn/ui components
  (copied into `src/components/ui/`), plain `fetch` wrapper in
  `src/lib/api.ts`, no router library
- `db`: Postgres 16 in Docker Compose (named volume)
- Tests: Vitest + Supertest for the API; no automated frontend tests

Before using any package API, check the installed version in the relevant
`package.json`. Do not add a dependency without asking first.

- `api/` and `web/` each commit their `package-lock.json`; Dockerfiles run
  `npm ci` against it.
- `api/` and `web/` each include a project `.npmrc` pinning the public npm
  registry (`registry.npmjs.org`), independent of any global npm config.

## Commands

```bash
docker compose up --build            # full stack; migrations + seed run on api start
docker compose up --build -V         # after adding/changing dependencies (renews
                                     # anonymous volumes; the api/web node_modules
                                     # volumes are named, so -V often isn't enough —
                                     # see the reset command below if deps are stale)
docker compose down -v               # wipe the DB (use for fresh-clone checks)
docker compose exec api npm test     # PRIMARY way to run API tests
docker compose exec api npm run typecheck
docker compose exec web npm run typecheck
docker compose exec web npm run build
npm --prefix api run db:generate     # after editing api/src/db/schema.ts

# If a service still has stale dependencies after `up --build -V` (its
# node_modules volume is named, not anonymous, so -V doesn't recreate it):
docker compose rm -sf web && docker volume rm course-studio_web-node-modules
docker compose up --build -d web     # swap `web` for `api` if that's the stale one
```

`.env` is optional for `docker compose up --build`; defaults live in
`docker-compose.yml`. Copy `.env.example` to `.env` only for host-run commands.

Host-run gotcha: running `docker compose up` first creates `api/node_modules`
and `web/node_modules` on the host as root (anonymous volume mount points), so
a later host `npm ci` fails with EACCES. Use `docker compose exec` for tests,
or delete those folders with sudo before a host install.

URLs: web http://localhost:5173 · api http://localhost:3000

Seeded accounts (password `Demo123!`):
`creator1@demo.test`, `creator2@demo.test` (role `creator`),
`alice@demo.test`, `bob@demo.test` (role `learner`).

## Data model

- `users`: id (uuid), email (unique), password_hash, role (`creator` | `learner`)
- `courses`: id, title, description, status (`draft` | `published`),
  **version** (int, starts at 1), created_by, updated_by, created_at,
  updated_at, published_at
- `lessons`: id, course_id (FK, cascade delete), position (int), title, body
  (plain text); unique (course_id, position)
- `lesson_completions`: user_id, lesson_id (FK, cascade delete), completed_at;
  primary key (user_id, lesson_id)

## Layout

```
api/src/
  routes/        auth.ts, courses.ts, progress.ts   # HTTP only: validate, call service, map errors
  services/      auth.ts, courses.ts, progress.ts   # business logic + transactions
  db/            schema.ts, migrations/, seed.ts, client.ts, migrate.ts
  middleware/    auth.ts (requireUser, requireRole), errors.ts (HttpError, errorHandler)
  lib/           cursor.ts
  __tests__/
web/src/
  pages/, components/, components/ui/ (shadcn), lib/api.ts, lib/utils.ts, types.ts, index.css
```

## Rules

**Course editing and concurrency**
- The editor saves the whole course (title, description, lessons) in one
  request: `PUT /api/courses/:id` with the `version` it loaded.
- The save runs in one transaction. First:
  `UPDATE courses SET ..., version = version + 1 WHERE id = $id AND version = $version RETURNING *`.
  If no row is returned: the course doesn't exist (404) or the version is
  stale (409). On 409, return the current course (including its version and
  lessons) so the UI can show the conflict. Only after the update succeeds,
  replace the lessons (update by id, insert new, delete removed, renumber
  positions 1..n).
- Never hold a lock across user think-time. Optimistic locking is deliberate
  here because editing is long-lived. Don't switch to `SELECT ... FOR UPDATE`
  without discussing it first.
- Deleting a lesson cascades to its completions. This is accepted and documented.
- Publishing (`POST /api/courses/:id/publish`) also requires and bumps `version`.
- Drizzle wraps Postgres errors in `DrizzleQueryError`: the Postgres error
  code (e.g. `23505` unique violation) is on `err.cause.code`, not `err.code`.
  Use the shared `isUniqueViolation` helper.

**Progress**
- Learners can only see and complete lessons of **published** courses.
- Marking a lesson complete is idempotent (`INSERT ... ON CONFLICT DO NOTHING`);
  completing twice returns success, not an error.
- Progress for a course = completed lessons / current lesson count.

**Auth and roles**
- Register always creates a `learner`; never accept a role from the request.
  Creator accounts come only from the seed.
- JWT (jsonwebtoken, HS256) in an httpOnly cookie, payload `{ sub, role }`,
  1-day expiry. Cookie: `httpOnly`, `sameSite=lax`, `secure` only in production.
- Take the user ID from `req.user` (set by `requireUser`), never from the body.
- Unknown email and wrong password return the same generic 401.

**API**
- REST with meaningful status codes: 400 validation, 401 unauthenticated,
  403 wrong role, 404 missing, 409 conflict. Error body: `{ "error": string }`
  (a 409 on course save may add `current`, the latest course).
- Every input (body, params, query) is validated with Zod; derive types with
  `z.infer`. Routes use `.parse()`; `errorHandler` maps `ZodError` to 400.
- Throw `HttpError(status, message)` for expected failures; never call
  `res.status()` for errors inside routes or middleware.
- List endpoints use keyset cursor pagination (`?cursor=&limit=`, limit max 50)
  and return `{ items, nextCursor }`. The sort key and the cursor key must match.
- Datetimes are ISO 8601 with an offset, stored as `timestamptz` (UTC).

**Data**
- Schema lives only in `api/src/db/schema.ts`. After changing it, run
  `db:generate` and commit schema and migration together. Never hand-edit
  generated migrations.
- Fixed-value columns (`role`, `status`) use Drizzle's
  `text(column, { enum: [...] })` plus a Postgres `CHECK` constraint, not `pgEnum`.
- Parameterised queries only; never concatenate strings into SQL.

**TypeScript and React**
- `strict: true`, no `any` (use `unknown` and narrow), no unexplained `as` casts.
- Functional components; server data is fetched in page components and passed
  down to presentational components. Style with Tailwind utility classes and
  shadcn/ui components; no inline `style={}` and no other CSS frameworks.
- Use only the shadcn/ui components actually needed (e.g. button, input,
  textarea, label, card, badge, progress, alert). Don't hand-edit files in
  `src/components/ui/` unless necessary.

**Security (local-app appropriate)**
- Config comes from environment variables validated in `api/src/config.ts`
  (`JWT_SECRET` at least 32 characters). `.env` is gitignored; keep
  `.env.example` complete. All `dotenv.config()` calls use `quiet: true`.
- Hash passwords with bcryptjs (10 rounds). Never log passwords, tokens or cookies.
- CORS allows only the web origin from config, with credentials.

## Testing

- Tests live in `api/src/__tests__/`, named `<area>.test.ts`, and run inside
  the container: `docker compose exec api npm test`.
- Tests use a separate database, `course_studio_test` (URL from
  `TEST_DATABASE_URL`), never the dev database. Migrations run once in global
  setup; tables are truncated between tests. Test files run sequentially
  (`fileParallelism: false`) because they share one database.
- **Integration tests are the default:** exercise routes with Supertest
  against real Postgres. Unit tests only for pure logic (e.g. cursor encode/decode).
- **Concurrency test (must always pass):** two or more saves of the same course
  sent in parallel with the same `version` produce exactly one 200; the rest
  get 409 and the response includes the current version. A sequential stale
  save also gets 409. Run it after any change to course editing or the schema.
- Also cover: learners can't see drafts (404), completion is idempotent,
  progress percentage, and the 401/403 cases.
- New behaviour gets a test; a bug fix gets a test that would have caught it.
- **Never say something works unless you ran it.** Report the actual command
  and result. If you couldn't run it, say so.

## Working agreement

- Don't invent package APIs, file paths or functions. Read or grep first.
- Before changing auth, the schema or the course save transaction, briefly
  state the plan and wait for approval.
- Keep diffs focused on the task; don't refactor unrelated code.
- Commits: Conventional Commits, e.g. `feat(courses): add optimistic locking on save`.
- Never run `aws` or `cdk deploy/destroy/bootstrap`.

## README must always contain

What it is and why · quick start (`docker compose up --build`) · demo
credentials · architecture and how lost updates are prevented (optimistic
locking, and why) · how to run tests · known issues and cuts · what I'd do
with more time · how AI tools were used. Update it in the same commit as
behaviour changes.