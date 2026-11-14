# Changelog de Pull Requests

Registro del título y la descripción de cada PR, tal como se pegaron en GitHub (en inglés). El más nuevo arriba.
El detalle técnico por commit está en [`Backend/CHANGELOG.md`](../Backend/CHANGELOG.md) y el contrato HTTP en [`docs/API_Frontend.md`](API_Frontend.md).

### 2026-11-14 · feature/bootstrap → develop

**Last commit:** `d885c89` — `chore: bootstrap three-layer backend with gRPC, PostgreSQL, CI and docs`

**Title:** chore: bootstrap three-layer backend with gRPC, PostgreSQL, CI and docs

**Description:**

## Summary

Bootstraps the project: a pnpm monorepo with three backend services (Gateway, Business, Data Access) that talk over gRPC, PostgreSQL and Valkey in Docker, architecture rules enforced by tooling, CI on GitHub Actions, and the project documentation. The only functional routes are health checks; the first user story (sign up and log an expense) comes next.

## Changes

### Repository and tooling
- pnpm workspace at the root (`App/`, `Backend/*`, `Packages/*`), Node 24, TypeScript 7 (`tsc` for build and type checks).
- Jest transformed with SWC, oxlint, dependency-cruiser with layer rules: no imports between services, no imports across domains, no skipped layers, and only Data Access may import `pg` / `drizzle-orm`.
- pnpm supply-chain settings: 7-day `minimumReleaseAge`, `blockExoticSubdeps`, `trustPolicy: no-downgrade`, explicit `allowBuilds`.
- `docker-compose.yml`: PostgreSQL 18 and Valkey 8, bound to `127.0.0.1` on ports 5433 / 6380.
- `.env.example` at the root (Compose) and in each service.

### Packages
- `proto`: `health.v1.HealthService`, linted with `buf` and compiled with `ts-proto`.
- `core`: `AppError` + `ErrorCode` (including `MALFORMED_REQUEST`, `PAYLOAD_TOO_LARGE`), `handleUnary` / `callUnary` gRPC helpers that propagate the request id and send error codes in `details`, a pino logger with `request_id` via `AsyncLocalStorage`, and `readRequiredEnv`.
- `testing`: fake gRPC health server and a silent logger.

### Backend/Gateway
- Express 5 with helmet, a 50 kb JSON body limit, `x-powered-by` disabled.
- `x-request-id` accepted only if it matches `^[A-Za-z0-9-]{1,64}$`; otherwise a UUID is generated.
- Error handler: `{ error: { code, message } }` with the real HTTP status, translated with i18next. Body-parser errors map to 400 / 413 instead of 500, and the handler respects `res.headersSent`.
- One structured log line per request, written on `close` and including aborted requests.
- `listen` errors and `unhandledRejection` log `fatal` and exit with code 1; the gRPC client is closed on shutdown.

### Backend/Business
- Health check that calls Data Access over gRPC (Service → Repository → External service, tsyringe DI).
- Exits on `unhandledRejection`; the gRPC client is closed on shutdown.

### Backend/DataAccess
- Drizzle ORM + `pg` with a pool that has connection, statement and query timeouts and an idle-error listener.
- Health check runs `select 1` against PostgreSQL and returns `SERVICE_UNAVAILABLE` when the database is down.
- `Database/Init/01-CreateRoles.sh`: `expense_migrator` owns the schema (DDL); `expense_app` gets DML only through default privileges.
- Scripts: `test:integration`, `db:generate`, `db:migrate`.

### Tests
- 18 unit tests (no Docker needed), including 400 / 413 responses and request-id propagation across services.
- 3 integration tests against the Docker PostgreSQL: the app role cannot create or drop tables but can read and write what the migrator creates.

### CI (`.github/workflows/ci.yml`)
- Jobs: checks (build, typecheck, tests, lint, depcruise), integration tests (Compose PostgreSQL with random per-run passwords), and a gitleaks scan over the full history.
- Read-only permissions, `persist-credentials: false`, actions pinned to commit SHAs, gitleaks binary verified by SHA-256.

### docs
- `README.md` (English), `LICENSE` (MIT).
- `docs/Decisiones_Tecnicas.md`, `docs/Desarrollo_Local.md`, `docs/backlog.md`, `docs/API_Frontend.md`, `Backend/CHANGELOG.md`, and this file.

## Endpoints

| Method | Path | Change |
|---|---|---|
| GET | `/isAlive` | New: Gateway liveness |
| GET | `/isAliveChain` | New: Gateway → Business → Data Access → PostgreSQL |

Every route can now return 400 `MALFORMED_REQUEST` (unreadable JSON) and 413 `PAYLOAD_TOO_LARGE` (body over 50 kb).
