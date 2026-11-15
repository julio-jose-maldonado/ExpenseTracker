# Changelog de Pull Requests

Registro del título y la descripción de cada PR, tal como se pegaron en GitHub (en inglés). El más nuevo arriba.
El detalle técnico por commit está en [`Backend/CHANGELOG.md`](../Backend/CHANGELOG.md) y el contrato HTTP en [`docs/API_Frontend.md`](API_Frontend.md).

### 2026-11-15 · feature/service-dependencies → develop

**Last commit:** _sha pendiente_ — `refactor(backend): pass service dependencies as a defaulted last parameter`

**Title:** refactor(backend): pass service dependencies as a defaulted last parameter

**Description:**

## Summary

Service functions no longer look up their dependencies inside the function body. Each one now takes them as its last parameter: a destructured object where every dependency defaults to the tsyringe container. The signature shows what a service depends on, and a unit test can pass a fake directly, without the container or a fake gRPC server. Also documents the rule for layers 4 and 5 (ports and adapters). No behavior changes.

## Changes

### Backend
- Gateway `checkChainHealth`, Business `checkHealth` and Data Access `checkHealth`: the dependency moves from a `container.resolve(...)` call in the body to the last parameter, `{ dependency = container.resolve(...) } = {}`. A test can replace one dependency while the others still come from the container. Controllers are unchanged.
- Business and Data Access: `checkHealth` now declares the gRPC request as its first parameter (`_request`), which is what `handleUnary` passes.
- New unit tests for the three services that pass the dependency by hand. The Gateway one covers the "Business reports not ok" case, which had no test.

### docs
- `docs/Decisiones_Tecnicas.md`: new entry. `5.ExternalServices` makes the raw outbound call; `4.Repositories` is the adapter behind an interface that only uses domain types (never ts-proto messages or Drizzle rows), so replacing an external service only touches layer 5 and the adapter. Also records the dependency convention and the alternatives that were discarded.
- `CLAUDE.md`: the same two conventions.
- `Backend/CHANGELOG.md` and this file.

## Endpoints

No changes.

### 2026-11-15 · feature/app-skeleton → develop

**Last commit:** `d189c64` — `feat(app): add web app skeleton with end-to-end health check`

**Title:** feat(app): add web app skeleton with end-to-end health check

**Description:**

## Summary

Adds the web app skeleton (`App/`): Vite + React 19 with Tailwind 4, shadcn/ui, TanStack Query and i18next (es / en). Its only screen is a status card that calls the end-to-end health check (`/isAliveChain`) and shows whether the whole chain works. The app always calls the Gateway through `/api` on its own origin. Locally, Vite proxies `/api` to the Gateway; on AWS, CloudFront will do the same. No backend code changes.

## Changes

### App
- Vite 8 + React 19 + TypeScript 7 (`tsc --noEmit` for type checks), `@/` path alias.
- Tailwind 4 + shadcn/ui (neutral theme, light/dark following `prefers-color-scheme`, including the `dark:` variant), `Button` and `Card` components.
- i18next with its own instance, Spanish by default and English, with typed keys.
- `apiClient`: `apiGet` unwraps `{ data }` and throws `ApiError` with the Gateway's `code` and translated `message`. Network failures and 2xx responses without the `data` envelope use the `NETWORK` code.
- `ChainHealthCard` + `useChainHealth` (TanStack Query, no silent retries): shows loading, OK, or the error message and code, with a Retry button. A failed retry replaces a previous OK.
- Vite dev proxy: only `/api/...` is forwarded to `GATEWAY_URL` (default `http://localhost:3000`), with the prefix removed.
- 5 Vitest + Testing Library tests.

### Repository and tooling
- oxlint: `react`, `jsx-a11y` and `vitest` plugins.
- dependency-cruiser also checks `App/src`, with new rules: the app cannot import backend code (only the future `Packages/types`), and the backend cannot import the app. A `tsconfig.depcruise.json` resolves the app's `@/` alias, and a new `not-to-unresolvable` rule fails on any import it cannot resolve, so no import silently skips the other rules.
- Root `typecheck` and `test` no longer build the app bundle; `pnpm build` (and CI) still do.

### docs
- `docs/Decisiones_Tecnicas.md`: web app skeleton decisions, and a new entry on configuration and secrets on AWS (Secrets Manager, task definitions / SSM Parameter Store, one IAM role per service, and pending internal-traffic items from the bootstrap security review: verified TLS to RDS, private subnets and security groups for plaintext gRPC).
- `docs/Desarrollo_Local.md`, `README.md`, `CLAUDE.md`: how to run the app.
- `docs/API_Frontend.md`: the app calls the Gateway through `/api`.
- `Backend/CHANGELOG.md` and this file.

## Endpoints

No new routes. The app reaches the existing Gateway routes through `/api` (for example, `/api/isAliveChain` → `/isAliveChain`).

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
