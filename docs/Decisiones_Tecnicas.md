# Decisiones técnicas

Registro de decisiones del proyecto: qué se decidió, por qué y qué se descartó.
Las más nuevas van al final. Una decisión que se revierte no se borra: se agrega una nueva que la reemplaza.

---

## 2026-11-08 · Arquitectura de 3 capas con gRPC

**Decisión:** Gateway (REST público) → Negocio → Acceso a datos centralizado, un contenedor por capa, comunicación interna por gRPC. Solo la capa de datos toca Postgres.
**Por qué:** el objetivo del proyecto es practicar gRPC y despliegue en AWS (3 servicios ECS, service discovery, security groups encadenados). Para el dominio es de más, a propósito.

## 2026-11-08 · Redis: sesiones en el Gateway, cache general en Datos

**Decisión:** el Gateway guarda las sesiones; la capa de datos es dueña de la cache general, así Negocio no sabe si un dato vino de cache o de Postgres. En AWS: ElastiCache Valkey.
**Descartado:** Redis en un contenedor Fargate (efímero, se pierden sesiones en cada deploy); Redis OSS Serverless (mínimo 1 GB, ~USD 90/mes).

## 2026-11-08 · TypeScript 7 + SWC para Jest

**Decisión:** TypeScript 7.0.2 para compilar y chequear tipos. Jest transforma con `@swc/jest` (legacy decorators + metadata). Módulos CommonJS.
**Por qué:** proyecto nuevo, se aprovecha la última versión. TS 7.0 no tiene API JS (vuelve en 7.1), así que todo lo que la usa queda afuera: ts-jest, ts-node, `@swc-node/register`, typescript-eslint. Verificado que TS 7 emite bien la metadata de decoradores que necesitan TypeORM y tsyringe.
**Consecuencias:** Jest no chequea tipos (lo hace `pnpm typecheck`); dev con `tsc --watch` + `node --watch`; migraciones desde el JS compilado.

## 2026-11-08 · oxlint en vez de ESLint

**Decisión:** lint con oxlint (plugins typescript, unicorn, import, jest).
**Por qué:** ESLint necesita typescript-eslint para leer TS, y no soporta TS 7. Reevaluar cuando salga TS 7.1.
**Pendiente:** ver si reglas custom de estructura (una función por archivo, un método por repositorio) se pueden escribir como plugin JS de oxlint.

## 2026-11-08 · dependency-cruiser con parser SWC

**Decisión:** hacer cumplir las reglas de capas con dependency-cruiser configurado con `parser: "swc"`.
**Por qué:** así no depende de la API de TypeScript. Verificado con TS 7.

## 2026-11-08 · Contratos gRPC con buf + ts-proto

**Decisión:** los `.proto` viven en `Packages/proto`; `buf lint` (reglas STANDARD) + `buf generate` con el plugin `ts-proto` (`outputServices=grpc-js`). El código generado no se versiona: se genera en el build.
**Por qué:** buf viene como paquete npm (no depende de un `protoc` instalado en la máquina ni en Docker) y su lint mantiene los contratos consistentes. ts-proto da tipos TypeScript compartidos por las tres capas.

## 2026-11-08 · Errores como códigos, traducidos en el Gateway

**Decisión:** Negocio y Datos devuelven códigos estables (`AppError` con `code` + `internalMessage` solo para logs). El Gateway los traduce con i18next y responde con el status HTTP real. Los errores de validación (express-validator) devuelven el error de cada campo como clave de traducción.
**Descartado:** responder errores con HTTP 200 + `success: false`, y devolver solo un "inputs inválidos" genérico.

## 2026-11-08 · Otras elecciones de librerías

- Tests: Jest + supertest.
- Base: ~~TypeORM~~ → Drizzle (ver 2026-11-09). Roles separados: `migrator` (DDL) y app (DML).
- DI: tsyringe, un repositorio = una operación.
- Contraseñas: argon2id (recomendación actual de OWASP; bcrypt con cost ≥ 10 también sería aceptable).
- Validación: express-validator (en vez de zod, por familiaridad).
- Logs: JSON real con pino, `request_id` propagado por metadata de gRPC.

## 2026-11-08 · pnpm 11: scripts de instalación explícitos

**Decisión:** `allowBuilds` en `pnpm-workspace.yaml` permite solo `@bufbuild/buf` y `@swc/core` (necesitan su binario nativo); `protobufjs` queda bloqueado (su script no hace falta).

## 2026-11-08 · Repo separado en App/ y Backend/

**Decisión:** en la raíz solo `App/` (frontend) y `Backend/` (workspace pnpm con Gateway, Business, DataAccess y Packages), más `docs/` y `CLAUDE.md` comunes.
**Por qué:** no mezclar frontend y backend; el frontend no usa `proto` ni `core`. Reemplaza el layout inicial `apps/` + `packages/`.

**Nota:** `@parcel/watcher` (dependencia opcional de Jest 30.5 para modo watch) queda con su script bloqueado en `allowBuilds`: trae binarios precompilados.

## 2026-11-08 · Packages/ en la raíz y un solo workspace

**Decisión:** el workspace pnpm vive en la raíz y abarca `App`, `Backend/*` y `Packages/*`. Todos los paquetes compartidos van en `Packages/`: `types` (contrato HTTP, lo usan App y Gateway), `proto` y `core` (solo backend).
**Por qué:** App y Gateway tienen que consumir el mismo paquete de tipos con `workspace:*`. Un solo lugar para lo reutilizable. Reemplaza el `Backend/` como workspace propio.

## 2026-11-09 · Esqueleto de las 3 capas (tanda 2)

- **Formato de respuesta del Gateway:** éxito `{ data }`; error `{ error: { code, message } }` con el status HTTP real. `message` sale de i18next (`Locales/es.ts`, tipado como `Record<ErrorCode, string>` para que no falte ningún código).
- **Errores entre capas por gRPC:** el status gRPC indica la categoría (`UNAVAILABLE`, `INTERNAL`) y el `ErrorCode` viaja en `details`. Helpers compartidos en `core`: `handleUnary` (servidor) y `callUnary` (cliente, deadline de 3 s).
- **Request id:** el Gateway acepta `x-request-id` solo si cumple `^[A-Za-z0-9-]{1,64}$` (evita inyección en logs); si no, genera un UUID. Viaja por metadata gRPC y lo agrega el logger a cada línea vía AsyncLocalStorage.
- **Health:** `/isAlive` (solo el Gateway) y `/isAliveChain` (Gateway → Business → DataAccess). Contrato `health.v1.HealthService`.
- **gRPC sin TLS entre capas** por ahora: tráfico interno en red privada. Revisar al llegar a AWS.
- **Controllers gRPC** como funciones fábrica (`createHealthController(logger)`) en vez de clases: el tipo que genera ts-proto tiene un index signature que obliga a hacks en una clase. Los controllers HTTP del Gateway sí son clases.
- **`Packages/testing`:** helpers de test compartidos (servidor gRPC falso, logger silencioso), extraídos al repetirse dos veces.
- **dependency-cruiser:** reglas de capas, sin imports entre servicios, sin cruces entre dominios, sin ciclos, y `drizzle-orm`/`pg`/`redis` solo en DataAccess. Verificado que detecta violaciones.

## 2026-11-09 · Drizzle en lugar de TypeORM

**Decisión:** ORM Drizzle + `pg`, solo en DataAccess. Esquema en TypeScript, un archivo por dominio. Migraciones `.sql` versionadas generadas con `drizzle-kit` y aplicadas por el rol `migrator`; la app usa el rol DML. Los tipos inferidos (`$inferSelect`/`$inferInsert`) no salen de DataAccess: entre capas manda el proto y entre Gateway y App, `Packages/types`.
**Por qué:** sin decoradores ni `reflect-metadata` (mejor con TS7), migraciones en SQL plano (encaja con los roles separados y evita correrlas desde el JS compilado), queries cercanas al SQL. Además en el trabajo ya se usa TypeORM: así se aprende algo nuevo.
**A tener en cuenta:** la API de relaciones cambió entre versiones; fijar la versión estable vigente al instalar.

## 2026-11-09 · Auth a mano, no Better Auth

**Decisión:** registro, login, sesión y recuperación se implementan a mano: argon2id, sesión en cookie `httpOnly` manejada por el Gateway y guardada en Redis.
**Por qué:** Better Auth maneja sus tablas directo en la base; acá solo DataAccess toca Postgres. Usarla implicaría darle base al Gateway o exponer un CRUD genérico por gRPC. Además las historias 1, 2 y 9 son de las más útiles para practicar gRPC, Redis y SES.
**Cuándo sí convendría:** con un auth "angosto" (un proveedor externo + JWT) Better Auth no aporta mucho; con un auth "ancho" (email/contraseña, verificación y recuperación por código, varios proveedores sociales) sí vale la pena evaluarla, sobre todo en un monolito.
**Criterio de seguridad (historias 1, 2 y 9):** no revelar si un email existe (mismo mensaje y una verificación de hash aunque el usuario no exista).

## 2026-11-09 · Stack del frontend

**Decisión:** React + Vite + TypeScript, TanStack Query para el estado del servidor, shadcn/ui + Tailwind, React Hook Form para formularios, Zustand solo para estado de UI (idioma, menús). La sesión no va en Zustand: es una cookie `httpOnly`.
**Validación compartida:** sin zod. Las reglas (largo y regex de contraseña, monedas permitidas) son constantes en `Packages/types`, usadas por express-validator en el Gateway y por la validación nativa de React Hook Form.
**Cuándo entra:** tanda 4 crea la App con Vite, Tailwind, shadcn y TanStack Query; React Hook Form y Zustand entran con la historia 1, cuando se usen.
**Nota TS7:** no existe `baseUrl`; el alias `@/` de shadcn se configura solo con `paths`.
**Origen:** se comparó con un stack "para trabajar con agentes" (video de HolaMundo, 2026-11-06). Se adopta todo menos Better Auth; Hono no hace falta (seguimos con Express).

## 2026-11-10 · Postgres y Valkey en local (tanda 3)

- **docker-compose** en la raíz con `postgres:18-alpine` y `valkey/valkey:8-alpine` (misma familia que RDS y ElastiCache Valkey). Puertos del host `5433` y `6380`, atados a `127.0.0.1`, para no chocar con otros Postgres o Redis de la máquina. Los servicios Node corren fuera de Docker por ahora.
- **Roles:** `Backend/DataAccess/Database/Init/01-CreateRoles.sh` (corre una sola vez, con el volumen vacío) crea `expense_migrator`, dueño de la base y de `public` (DDL), y `expense_app`, el de runtime, con solo `CONNECT` + `USAGE` y DML por `ALTER DEFAULT PRIVILEGES` sobre todo lo que cree el migrator. Así ninguna migración tiene que acordarse de dar permisos. Verificado con tests de integración: la app no puede crear ni borrar tablas, pero sí leer y escribir lo que crea el migrator. En AWS, crear estos roles en RDS queda para la etapa de infra.
- **Drizzle:** `drizzle-orm@0.45.4` + `drizzle-kit@0.31.11` (las estables; la 1.0 sigue en beta) + `pg@8.23.1`. Pool con `connectionTimeoutMillis` de 2 s, menor que el deadline de 3 s de `callUnary`, y listener de `error` para que una conexión ociosa caída no tire el proceso. Las variables de base van separadas (`DATABASE_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD`) y no como URL, porque así encajan con el secreto de RDS y no hay que escapar la contraseña.
- **Migraciones:** `pnpm --filter @expense-tracker/data-access db:generate` / `db:migrate`, con las credenciales del migrator. Esquema en `src/Database/Schema/` y SQL en `Database/Migrations/`. `db:migrate` falla mientras no haya ninguna migración (drizzle-kit pide `meta/_journal.json`): la primera llega con la historia #1. No se crea una migración vacía de relleno.
- **Health de DataAccess:** `select 1` contra Postgres, por las capas Service → Repository (tsyringe) → ExternalService, igual que Business. Si la base no responde, devuelve `SERVICE_UNAVAILABLE`, y la cadena `/isAliveChain` llega hasta la base real.
- **Tests:** `pnpm test` no necesita Docker. `pnpm --filter @expense-tracker/data-access test:integration` corre contra el Postgres del compose.
- **Variables locales:** cada servicio carga su propio archivo de variables con `node --env-file-if-exists` (en AWS llegan por el entorno). Cada carpeta tiene un `.env.example` versionado (raíz para docker compose, más uno por servicio), y se explican en `docs/Desarrollo_Local.md`.
- **Valkey:** por ahora solo está el contenedor. El cliente entra cuando se use (sesiones del Gateway en la historia #1/#2, cache de DataAccess después).
- **pnpm:** `esbuild` (dependencia de drizzle-kit) queda con su script bloqueado en `allowBuilds`, porque funciona con el binario precompilado.

## 2026-11-12 · CI con GitHub Actions

**Decisión:** `.github/workflows/ci.yml` en cada push a `main`/`develop` y en cada PR, con tres jobs: chequeos (typecheck, tests, lint, depcruise), integración (`docker compose up postgres` con el mismo script de roles que en local y contraseñas aleatorias por corrida, enmascaradas) y gitleaks sobre todo el historial.
**Seguridad del workflow:** `permissions: contents: read`, `persist-credentials: false`, actions fijadas por SHA de commit (con el tag en un comentario), y versiones con al menos unas semanas publicadas (por eso `pnpm/action-setup` v6.1.0 y no la v6.1.1, que tenía 9 días). gitleaks se baja del release oficial con checksum SHA-256 verificado, en vez de usar una action de terceros.
**Por qué gitleaks en CI y no con husky:** el pre-commit global de la máquina ya corre gitleaks, y husky reemplazaría ese `core.hooksPath` global. El CI cubre lo que un hook local no cubre: `--no-verify` y commits hechos desde otra máquina.
**Validado:** con actionlint (incluye shellcheck); `pnpm install --frozen-lockfile` al día. La primera corrida real va a ser con el primer push.

## 2026-11-14 · Revisión antes de publicar el repo

Revisiones: code-review, Codex, semgrep `p/default` y revisión de seguridad manual (el skill `security-review` necesita un remoto que todavía no existe).
**Corregido:**
- Errores de `express.json` (JSON malformado, body > 50 kb) respondían 500: ahora 400 `MALFORMED_REQUEST` y 413 `PAYLOAD_TOO_LARGE`. El error handler respeta `res.headersSent`.
- Gateway: los errores de `listen` (puerto ocupado) se registran como `fatal` y el proceso sale con 1. En Express 5 el callback de `listen` también recibe el error, así que ya no loguea "listening" cuando falla.
- `unhandledRejection` en los tres servicios: `fatal` + salir con 1, para que ECS levante otra instancia en vez de seguir en un estado desconocido.
- Pool de Postgres con `statement_timeout` (2 s) y `query_timeout` (2,5 s): una query trabada ya no retiene la conexión después de que gRPC se rindió.
- Los clientes gRPC se cierran al apagar y entre tests (`disposeContainerList`).
- Log de requests en `close` en vez de `finish`, con `aborted`, para no perder los requests que el cliente corta.
- pnpm: `minimumReleaseAge` de 7 días, `blockExoticSubdeps` y `trustPolicy: no-downgrade`.
- CI: un solo build por job.

**Pendiente (con la historia #1, cuando haya errores de dominio entre capas):**
- `callUnary` debería reconstruir el `AppError` desde el `details` del status gRPC. Hoy cada caller envuelve cualquier falla como `SERVICE_UNAVAILABLE`, y un `NOT_FOUND` de abajo llegaría al usuario como 503. Con eso desaparece el try/catch duplicado de los health checks de Gateway y Business.
- Propagar el deadline entrante en vez de poner 3 s nuevos en cada salto.
- Log de requests: con routers montados bajo un prefijo, `req.baseUrl` ya volvió al del padre cuando se escribe la línea.

## 2026-11-14 · Esqueleto de la App (tanda 4)

- **Stack:** Vite 8 + React 19 + TypeScript 7, Tailwind 4 (`@tailwindcss/vite`), shadcn/ui (estilo new-york, base neutral, modo claro/oscuro por `prefers-color-scheme`), TanStack Query 5, i18next + react-i18next. React Hook Form y Zustand siguen esperando a la historia #1.
- **tsconfig propio** (no extiende el base): `moduleResolution: bundler`, `jsx: react-jsx`, `noUncheckedIndexedAccess`. El alias `@/` va solo con `paths` (TS 7 no tiene `baseUrl`).
- **Llamadas al backend por `/api` en el mismo origen.** En local, el proxy de Vite reenvía `/api/*` al Gateway sin el prefijo (`GATEWAY_URL`, default `http://localhost:3000`). En AWS lo va a hacer CloudFront (behavior `/api/*` → ALB). **Por qué:** sin CORS, y la cookie de sesión `httpOnly` funciona con `SameSite=Strict` sin configuración extra.
- **Cliente HTTP** (`src/api/apiClient.ts`): desarma `{ data }` / `{ error: { code, message } }` en un `ApiError` con `status`, `code` y el mensaje ya traducido. Si el servidor no responde o no devuelve JSON, el código es `NETWORK` y la App muestra un texto propio. Las formas del sobre pasan a `@expense-tracker/types` con la historia #1.
- **i18n:** instancia propia (`createInstance`), español por defecto y textos en inglés tipados contra los de español: si falta o sobra una clave, no compila. Las claves de `t()` también están tipadas.
- **Tests del front con Vitest** + Testing Library + jsdom, no Jest: Vitest usa la misma configuración y el mismo pipeline de Vite, sin otro transformador. El backend sigue con Jest + SWC.
- **Versiones y `minimumReleaseAge`:** toda la mayor 27 de `i18next` tenía menos de 7 días, así que la App usa 26.7.2 (el Gateway quedó en 27.0.1, instalado antes de la regla). Por la misma razón, `react-i18next` 17.1.13 en vez de la 18. pnpm no busca una versión anterior dentro del rango: si la última no cumple la antigüedad, falla, y hay que fijar una exacta.
- **shadcn:** la CLI 4.23 no resolvió el alias `@/lib/utils` e instaló el paquete `cn` (del autor de shadcn, 0.x, de pocos días y sin repo publicado) como reemplazo de `clsx` + `tailwind-merge`. Se sacó: los componentes usan `@/lib/utils`. Se mantiene `radix-ui`, el paquete oficial que ahora usa shadcn en lugar de `@radix-ui/react-*`. Revisar el diff después de cada `shadcn add`.
- **Lint:** oxlint suma los plugins `react`, `jsx-a11y` y `vitest`; `react-in-jsx-scope` apagada (no aplica con el JSX runtime nuevo).
- **dependency-cruiser:** la App no puede importar de `Backend/` ni de `Packages/core|proto|testing` (solo va a poder usar `Packages/types`), y el backend no puede importar de la App. Verificado con un import prohibido. depcruise lee `tsconfig.depcruise.json` (el base más el alias `@/` de la App) para resolver esos imports, y la regla `not-to-unresolvable` falla si algún import no se resuelve, porque un import sin resolver se saltea las demás reglas sin avisar.

## 2026-11-14 · Configuración y secretos en AWS (para la etapa de infra)

**Decisión:** en AWS no hay archivos `.env`.
- **Secretos** (contraseñas de Postgres) en **Secrets Manager**. RDS genera y guarda la contraseña maestra ahí (con rotación); CDK genera como secretos las de `expense_migrator` y `expense_app`.
- **Configuración no secreta** (puertos, direcciones entre servicios) como variables del task definition de ECS, o en **SSM Parameter Store** (nivel estándar, gratis) si hace falta cambiarla sin redesplegar.
- ECS inyecta los secretos como variables de entorno al arrancar cada contenedor: **el código no cambia**, sigue leyendo `process.env` con `readRequiredEnv`.
- Cada servicio tiene su propio rol de IAM, que solo puede leer sus secretos: el Gateway no ve la contraseña de la base.

**Por qué:** los secretos no viven en ningún archivo ni en el repo, el acceso queda auditado y limitado por servicio, y existe la rotación.
**A tener en cuenta:** Secrets Manager cuesta USD 0,40 por secreto por mes, prorrateado (centavos destruyendo el stack después de cada sesión). Como los secretos se leen al arrancar, rotar una contraseña requiere reiniciar las tareas de ECS para que la tomen.
**En local:** se sigue con `.env` (`.env.example` versionado, solo con los nombres). Usar Secrets Manager desde la laptop implicaría credenciales de AWS locales y depender de la red para desarrollar, sin nada que proteger.
