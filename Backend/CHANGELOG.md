# Changelog técnico del Backend

Cambios técnicos de `Backend/` (Gateway, Business, DataAccess) y de los paquetes compartidos de backend (`Packages/core`, `Packages/proto`, `Packages/testing`).
El contrato HTTP para el frontend tiene su propio changelog en [`docs/API_Frontend.md`](../docs/API_Frontend.md); las decisiones y su porqué, en [`docs/Decisiones_Tecnicas.md`](../docs/Decisiones_Tecnicas.md).

**Cómo se escribe:** una entrada por commit, antes del push, la más nueva arriba. Encabezado `### YYYY-MM-DD · shortsha` y título `####` con el asunto del commit. Si el commit toca algún `package.json`, va una sub-sección **Dependencias** con `` `paquete`: anterior → nueva `` (`—` si se agrega o se quita).

## Historial

### 2026-11-15 · _sha pendiente_

#### feat(core): rebuild AppError across gRPC hops and propagate the deadline

- `core` · `callUnary`: rechaza siempre con un `AppError`. Usa el `ErrorCode` que viene en `details`; sin código, decide por el status gRPC (`UNAVAILABLE` y `DEADLINE_EXCEEDED` → `SERVICE_UNAVAILABLE`, el resto → `INTERNAL`). `MALFORMED_REQUEST` y `PAYLOAD_TOO_LARGE` no cruzan entre capas (llegan como `INTERNAL`). El error original queda como `cause` (`AppError` acepta `{ cause }`). También convierte los errores que grpc-js lanza antes de enviar la llamada. Nuevos `appErrorFromGrpcError` e `isErrorCode`.
- `core` · `grpcStatusFromError`: tabla `Record<ErrorCode, status>` con un status por código (antes solo distinguía `SERVICE_UNAVAILABLE`); un código desconocido sale como `INTERNAL`.
- `core` · `handleUnary`: guarda en el contexto el deadline y el método de la llamada (`grpc_method` en cada línea), y deja una línea de cierre por llamada con `grpc_status`, `error_code`, `cancelled` y `duration_ms`. `error` solo para `INTERNAL` y `UNAVAILABLE`. Registra un `warn` cuando el caller se va antes de la respuesta. Convierte en `INTERNAL` un throw sincrónico del handler y valida el request id de la metadata (`isValidRequestId`, que ahora también usa el Gateway).
- `core` · contexto: `RequestContext` suma `deadline`, `clientIp` y `grpcMethod`, con sus getters. `runWithRequestContext` reemplaza a `runWithRequestId` (borrada).
- `core` · `callUnary` usa el menor entre su límite (3 s) y el deadline heredado: los saltos ya no suman 3 s cada uno.
- Gateway y Business: `checkBusinessHealth` y `checkDataAccessHealth` sin try/catch. `/isAliveChain` responde 500 (antes 503) si una capa falla por un error inesperado; 503 si no responde.
- Gateway · log de requests: la ruta incluye el prefijo del router también cuando el handler falla.
- IP del cliente: el Gateway la toma de `req.ip` y el logger agrega `client_ip` a cada línea del request. Variable opcional `TRUSTED_PROXY_HOPS` (0 por defecto, máximo 5) para `trust proxy`. Si el valor reenviado no es una IP, se usa la de la conexión.
- Gateway · log de requests: suma `user_agent`, recortado a 200 caracteres; el path sin ruta también se recorta a 200.
- `core` · logger: `redact` de pino ofusca con `[REDACTED]` contraseñas, tokens, id de sesión, email, cookies y `authorization`, hasta dos niveles de anidación.
- Tests nuevos: en `core`, `Grpc/UnaryCalls` (24), `Grpc/GrpcStatusFromError` (3), `Context/RequestDeadline` (3), `Context/ClientIp` (4) y `Logs/Redact` (11); en el Gateway, `RequestLog` (8) y `ClientIp` (15). Dos tests existentes de `core` pasan a usar `runWithRequestContext`.
- Sin cambios de dependencias.

### 2026-11-15 · 43c3cc1

#### refactor(backend): pass service dependencies as a defaulted last parameter

- Services de Health en Gateway, Business y DataAccess: la dependencia pasa del cuerpo (`container.resolve` adentro) al último parámetro, un objeto desestructurado con `container.resolve(...)` como default de cada propiedad. Los controllers no cambian.
- Business y DataAccess: `checkHealth` recibe el request gRPC como primer parámetro (`_request`), que es lo que le pasa `handleUnary`.
- Tests unitarios de los tres services (`Gateway/test/CheckChainHealth.test.ts`, `Business/test/CheckHealth.test.ts`, `DataAccess/test/CheckHealth.test.ts`), que pasan la dependencia a mano. El del Gateway cubre el caso "Business responde que no está ok".
- Convención y regla de las capas 4 y 5 (puertos y adaptadores) en `docs/Decisiones_Tecnicas.md` y `CLAUDE.md`.
- Sin cambios de dependencias.

### 2026-11-15 · d189c64

#### feat(app): add web app skeleton with end-to-end health check

- `App/` nuevo (no es backend, pero comparte la raíz): Vite + React con la tarjeta que consulta `/isAliveChain` por `/api`. Detalle en `docs/Decisiones_Tecnicas.md`.
- Raíz: `typecheck` y `test` construyen todo menos la App (no necesitan su bundle); `pnpm build` y el CI la siguen construyendo.
- dependency-cruiser: recorre también `App/src`, reglas App ↔ Backend, `tsconfig.depcruise.json` para el alias `@/` y regla `not-to-unresolvable`.
- oxlint: plugins `react`, `jsx-a11y` y `vitest`.
- Sin cambios de código ni de dependencias en `Backend/` ni en `Packages/`.
- **Dependencias (App, nuevas):**
  - `react` · `react-dom`: — → 19.3.1
  - `@tanstack/react-query`: — → 5.107.1
  - `i18next`: — → 26.7.2 (la mayor 27 todavía no cumple los 7 días de `minimumReleaseAge`; el Gateway sigue en 27.0.1)
  - `react-i18next`: — → 17.1.13
  - `radix-ui`: — → 1.8.1 · `lucide-react`: — → 1.70.0
  - `class-variance-authority`: — → 0.7.1 · `clsx`: — → 2.1.1 · `tailwind-merge`: — → 3.7.0
  - dev: `vite` 8.3.6, `@vitejs/plugin-react` 6.2.1, `tailwindcss` · `@tailwindcss/vite` 4.3.5, `tw-animate-css` 1.4.0, `@types/react` · `@types/react-dom` 19.3.0, `vitest` 5.1.0, `jsdom` 31.0.0, `@testing-library/react` 16.3.3, `@testing-library/jest-dom` 7.0.1, `@testing-library/user-event` 14.6.8

### 2026-11-14 · d885c89

#### chore: bootstrap the three-layer backend with gRPC, PostgreSQL and CI

- Monorepo pnpm en la raíz (`App/`, `Backend/*`, `Packages/*`), TypeScript 7, Jest con SWC, oxlint y dependency-cruiser con las reglas de capas.
- `Packages/proto`: contrato `health.v1.HealthService` (buf + ts-proto). `Packages/core`: `AppError` + `ErrorCode`, `handleUnary`/`callUnary`, logger pino con `request_id` por AsyncLocalStorage, `readRequiredEnv`. `Packages/testing`: servidor gRPC falso y logger silencioso.
- Gateway (Express 5): `/isAlive` y `/isAliveChain`, request id validado, helmet, body de hasta 50 kb, errores `{ error: { code, message } }` traducidos con i18next (400, 404, 413, 500, 503).
- Business: health que consulta a DataAccess por gRPC.
- DataAccess: Drizzle + `pg` con pool (timeouts de conexión y de query); health con `select 1` contra Postgres.
- `docker-compose.yml` con Postgres 18 y Valkey 8; `Database/Init/01-CreateRoles.sh` crea los roles `expense_migrator` (DDL) y `expense_app` (DML).
- Variables de entorno: `.env.example` en la raíz (compose) y en cada servicio. DataAccess suma `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `MIGRATOR_DATABASE_USER`, `MIGRATOR_DATABASE_PASSWORD`.
- Scripts de DataAccess: `test:integration`, `db:generate`, `db:migrate`. Los tres servicios cargan su `.env` con `node --env-file-if-exists`.
- Arranque y apagado: errores de `listen` y `unhandledRejection` terminan el proceso con 1; los clientes gRPC y el pool se cierran al apagar.
- Tests: 18 unitarios (sin Docker) y 3 de integración (roles de Postgres).
- CI (GitHub Actions): chequeos, tests de integración y gitleaks sobre todo el historial.
- **Dependencias:** ver la base inicial al final del archivo.

## Dependencias iniciales

Base del bootstrap: commit `d885c89` del 2026-11-14. Las entradas del Historial registran **solo cambios** respecto de esta base; si un paquete no aparece en el Historial, no cambió desde el bootstrap.

**Paquetes internos** (`workspace:*`)

| Paquete | Gateway | Business | DataAccess |
|---|---|---|---|
| `@expense-tracker/core` | ✓ | ✓ | ✓ |
| `@expense-tracker/proto` | ✓ | ✓ | ✓ |
| `@expense-tracker/testing` (dev) | ✓ | ✓ | ✓ |

**Runtime**

| Paquete | Gateway | Business | DataAccess | core | proto |
|---|---|---|---|---|---|
| `@grpc/grpc-js` | 1.14.7 | 1.14.7 | 1.14.7 | 1.14.7 | 1.14.7 |
| `tsyringe` | 4.10.0 | 4.10.0 | 4.10.0 | — | — |
| `reflect-metadata` | 0.2.2 | 0.2.2 | 0.2.2 | — | — |
| `express` | 5.3.0 | — | — | — | — |
| `helmet` | 8.3.0 | — | — | — | — |
| `i18next` | 27.0.1 | — | — | — | — |
| `drizzle-orm` | — | — | 0.45.4 | — | — |
| `pg` | — | — | 8.23.1 | — | — |
| `pino` | — | — | — | 10.4.0 | — |
| `@bufbuild/protobuf` | — | — | — | — | 2.17.0 |

**Desarrollo**

| Paquete | Dónde | Versión |
|---|---|---|
| `typescript` | raíz | 7.0.2 |
| `jest` · `@swc/jest` · `@swc/core` | raíz | 30.5.2 · 0.2.39 · 1.16.22 |
| `@types/jest` · `@types/node` | raíz | 30.0.0 · 24.19.2 |
| `oxlint` | raíz | 1.92.0 |
| `dependency-cruiser` | raíz | 18.7.2 |
| `supertest` · `@types/supertest` · `@types/express` | Gateway | 7.3.2 · 7.2.1 · 5.0.6 |
| `drizzle-kit` · `@types/pg` | DataAccess | 0.31.11 · 8.23.1 |
| `@bufbuild/buf` · `ts-proto` | proto | 1.75.0 · 2.18.4 |

**Actual (referencia rápida):** sin cambios desde el bootstrap.
