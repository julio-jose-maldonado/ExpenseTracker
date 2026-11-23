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

**Tráfico interno (pendiente para la etapa de infra, surgió de la revisión de seguridad del bootstrap):**
- **TLS hacia Postgres:** hoy la conexión va sin TLS (`ssl: false` en `drizzle.config.ts` y el pool de `CreateDatabase.ts` sin `ssl`), que en local da igual. En RDS hay que activarlo verificando el certificado (`ssl: { ca: <bundle de CA de RDS>, rejectUnauthorized: true }`), tanto en el pool como en drizzle-kit, y forzarlo del lado de RDS con `rds.force_ssl = 1` en el parameter group. Sin verificar el certificado, el TLS no protege de alguien que se haga pasar por la base.
- **IP del cliente y `TRUSTED_PROXY_HOPS`** (agregado el 2026-11-15, la infra la definimos nosotros, así que se puede dejar bien desde el principio):
  - Definir `TRUSTED_PROXY_HOPS=2` en el task definition del Gateway: CloudFront y el ALB son los dos proxies propios. Si la arquitectura cambia (por ejemplo, la API sin CloudFront), el número cambia con ella. AWS WAF no suma un salto.
  - **El ALB no puede ser alcanzable sin pasar por CloudFront.** Si alguien le pega directo con un `X-Forwarded-For` inventado, con 2 saltos Express toma esa IP falsa: se falsea `client_ip` en los logs y se esquiva el rate limit por IP. Dos formas, que se pueden combinar: el security group del ALB solo acepta la lista de prefijos administrada de CloudFront (`com.amazonaws.global.cloudfront.origin-facing`), o CloudFront agrega un header secreto al origen y el ALB rechaza lo que no lo traiga.
  - **Verificar después del primer deploy:** hacer un request desde la propia conexión y comprobar que `client_ip` en CloudWatch es la IP pública propia, no una de CloudFront ni del ALB; repetirlo mandando un `X-Forwarded-For` inventado y comprobar que no cambia.
  - Los health checks del ALB llegan sin `X-Forwarded-For`, con la IP interna del balanceador: es lo esperado, y `/isAlive` va a quedar exento del rate limit.
  - Definir la retención de los logs en CloudWatch: la IP es un dato personal.
- **gRPC sin TLS entre servicios:** es a propósito (credenciales `insecure`), y en AWS se sostiene porque Business y DataAccess quedan en subredes privadas, sin IP pública, y sus security groups solo aceptan el puerto gRPC desde el servicio que los llama (DataAccess solo desde Business, Business solo desde el Gateway). Si algún día eso deja de alcanzar, el paso siguiente es TLS en gRPC (o mTLS con certificados por servicio).

## 2026-11-15 · Capas 4 y 5 como puertos y adaptadores, y dependencias de los services por parámetro

**Capas 4 y 5:**
- `5.ExternalServices`: una sola llamada cruda hacia afuera (gRPC, SQL, Redis, SES), sin decisiones. Maneja los tipos de afuera (mensajes de ts-proto, filas de Drizzle).
- `4.Repositories`: el adaptador. Implementa una interfaz (el contrato que usan los services), traduce entre los tipos de afuera y los del dominio, y combina fuentes cuando hace falta (en DataAccess, cache en Redis + Postgres).
- **Regla:** la interfaz de un repositorio solo usa tipos del dominio, nunca tipos de afuera.

**Por qué:** cambiar un servicio externo tiene que tocar solo la capa 5 y la implementación del adaptador. Si la interfaz devolviera un mensaje proto o una fila de Drizzle, el cambio obligaría a tocar la interfaz y los services. La traducción es además el trabajo propio de la capa 4: sin ella sería un pasamanos de la 5.

**Dependencias de los services:** los services siguen siendo funciones. Reciben sus dependencias en el último parámetro, siempre como un objeto desestructurado en el que cada dependencia tiene el contenedor de tsyringe como valor por defecto:

```ts
export async function checkChainHealth({
  businessHealth = container.resolve<ICheckBusinessHealth>(ICheckBusinessHealth),
}: { businessHealth?: ICheckBusinessHealth } = {}): Promise<void> {
```

Los datos de entrada van antes: `createExpense(input, { saveExpense = ..., findCategory = ... } = {})`. En Business y DataAccess el primer parámetro es siempre el request gRPC, que es lo que pasa `handleUnary`, aunque venga vacío (`_request`).
**Por qué:** la firma muestra de qué depende el service, y un test unitario le pasa un doble a mano (`checkChainHealth({ businessHealth: fake })`), sin registrar nada en el contenedor ni levantar un servidor gRPC falso. Los controllers no cambian.
**Por qué un objeto con un default por propiedad, y no un parámetro por dependencia ni un objeto con un default entero:** un test puede reemplazar una sola dependencia y las demás siguen saliendo del contenedor; cada una se resuelve solo si no vino. Además, si por error el service recibe otra cosa en ese lugar (el request, por pasarlo directo como callback), las propiedades no existen y se usan los defaults, en vez de tomar ese objeto como dependencia.
**Descartado:** services como clases `@injectable()` con inyección por constructor (se prefiere mantenerlos como funciones); `container.resolve` dentro del cuerpo (dependencia escondida, tests atados al contenedor global).

## 2026-11-15 · Errores y deadline entre capas (tanda 5)

Cierra los tres pendientes anotados el 2026-11-14.

- **`callUnary` rechaza siempre con un `AppError`.** Si la capa de abajo mandó un `ErrorCode` en `details` (lo pone `handleUnary`), se reconstruye con ese código: un `NOT_FOUND` de DataAccess llega al Gateway como `NOT_FOUND` y sale como 404. Si no hay código (capa caída, deadline vencido, error de transporte), decide el status gRPC: `UNAVAILABLE` y `DEADLINE_EXCEEDED` son `SERVICE_UNAVAILABLE`; el resto, `INTERNAL`. Un `details` que no es un `ErrorCode` conocido se ignora. El error gRPC original queda como `cause` del `AppError`, para los logs. También se convierte un error que grpc-js lanza antes de enviar la llamada (por ejemplo, con el cliente ya cerrado).
- **Códigos que no cruzan entre capas:** `MALFORMED_REQUEST` y `PAYLOAD_TOO_LARGE` describen el request HTTP del cliente y solo los decide el Gateway. Si una capa de abajo devuelve uno, es un error entre servicios y llega como `INTERNAL`, no como un 400 o un 413 que culpe al cliente.
- **Status gRPC por código** en una tabla `Record<ErrorCode, status>`: cada código nuevo obliga a elegir su status (hoy `NOT_FOUND`, `UNAVAILABLE`, `INVALID_ARGUMENT`, `RESOURCE_EXHAUSTED`, `INTERNAL`). Un código que la tabla no conoce (servicios con versiones distintas de `core` durante un deploy) sale como `INTERNAL`.
- **Los ExternalServices que llaman por gRPC ya no tienen try/catch:** el error correcto sale de `callUnary`. **Consecuencia:** `/isAliveChain` respondía 503 ante cualquier falla; ahora responde 503 si una capa no responde y 500 si una capa falla por un error inesperado.
- **Logs en `handleUnary`:** una línea de cierre por llamada (`grpc request completed`, nivel `info`) con `grpc_status`, `error_code` si hubo, `duration_ms` y `cancelled`, para ver qué capa es la lenta. `cancelled: true` avisa que el caller ya no esperaba (canceló o se le venció el deadline): sin eso, una capa que tardó 4 s figuraría como `OK` aunque el usuario haya recibido un 503. Además, en el momento en que el caller se va sale un `warn` (`grpc caller gave up before the response`): la línea de cierre recién se escribe cuando el handler termina, y un handler colgado no la escribiría nunca. Además, `error` con el detalle solo para fallas del servicio (`INTERNAL`, `UNAVAILABLE`); un error de dominio es una respuesta esperada y no tiene que disparar alarmas.
- **Handlers que fallan de forma sincrónica:** `handleUnary` también los convierte en `INTERNAL`. Antes la llamada quedaba sin responder hasta el deadline.
- **Request id por gRPC:** `handleUnary` valida el formato igual que el Gateway (`isValidRequestId`, en `core`); si no cumple, genera uno.
- **`grpc_method` en el contexto** de Business y DataAccess (`/paquete.Servicio/Metodo`): el logger lo agrega a cada línea, así un error en esas capas dice qué RPC falló.
- **Deadline propagado:** `handleUnary` guarda en el contexto del request el deadline de la llamada entrante, y `callUnary` usa el menor entre ese y su propio límite (3 s por defecto). Antes cada salto abría 3 s nuevos, así que Business podía seguir esperando a DataAccess cuando el Gateway ya había respondido 503. El contexto del request pasa a ser un objeto tipado, `RequestContext`, con un getter por dato (`getRequestId`, `getRequestDeadline`, `getClientIp`, `getGrpcMethod`); `runWithRequestContext` reemplaza a `runWithRequestId`.
- **Ruta en el log de requests:** se toma en el momento en que Express asigna `req.route` (con un setter sobre el request), no al cerrar la respuesta. Si el handler de un router montado bajo un prefijo fallaba, al escribir el log `req.baseUrl` ya había vuelto al del padre y quedaba `/:id` en vez de `/expenses/:id`.
- **Tests:** `callUnary` y `handleUnary` se prueban de punta a punta en `core` con un servicio gRPC mínimo definido en el test (mensajes JSON), sin depender de `Packages/proto`. Los tests de deadline y cancelación no usan esperas fijas: esperan a que el canal esté listo y usan un handler que el test libera, para no fallar bajo carga ni pasar sin haber ejercitado el handler.
- **Revisiones:** code-review, revisión de seguridad, semgrep y Codex. Lo aplicado está repartido en los puntos de arriba.
- **IP del cliente en el contexto y en los logs:** el Gateway guarda en el contexto del request la IP de quien llamó (`getClientIp`), y el logger la agrega como `client_ip` a cada línea de ese request. Sirve para ver, por ejemplo, llamadas repetidas a rutas que no existen desde una misma IP, y es la base del rate limit. No viaja a Business ni a DataAccess: no la necesitan.
- **`TRUSTED_PROXY_HOPS`** (opcional, 0 por defecto): cuántos proxies propios hay delante del Gateway; se pasa a `trust proxy` de Express. Con 0, la IP es la de la conexión y `X-Forwarded-For` se ignora, porque cualquier cliente puede inventarlo. En AWS van a ser 2 (CloudFront y el ALB): Express saltea esa cantidad desde la derecha del header y descarta lo que el cliente haya puesto adelante. Un valor de más deja que el cliente falsee su IP; uno de menos registra la IP del proxy. Un valor que no es un entero entre 0 y 5 frena el arranque: el tope evita que un error de tipeo (10 en vez de 1) deje la IP en manos del cliente. Si el valor que queda no tiene forma de IP, se usa la de la conexión.
- **`user_agent` en la línea del request** del Gateway, recortado a 200 caracteres (lo manda el cliente y puede ser enorme). Junto con la IP ayuda a distinguir un bot de un usuario real. El path de un request que ninguna ruta atendió también se recorta a 200.
- **Datos sensibles en los logs:** la regla es no registrar bodies, contraseñas, cookies de sesión, tokens ni emails (para identificar a alguien se va a usar `user_id`). Como red de seguridad, el logger ofusca con `[REDACTED]` los campos `password`, `newPassword`, `currentPassword`, `passwordHash`, `token`, `sessionId`, `email`, `cookie`, `authorization` y `set-cookie`, en el primer nivel y hasta dos objetos adentro (`redact` de pino). Si algún día se registra un body o los params, esos campos salen ofuscados. **Límites:** no cubre un dato sensible dentro de un texto (el mensaje de un error) ni a más de dos niveles; un campo sensible nuevo hay que sumarlo a la lista en `CreateLogger.ts`.
- **Limitación conocida del log de rutas:** si un handler pasa el control con `next()` y el request termina en 404, queda registrada la última ruta que coincidió y no el path pedido. Express tampoco limpia `req.route` en ese caso.
- **A tener en cuenta:** la IP es un dato personal. Definir cuánto tiempo se guardan los logs al configurar CloudWatch en la etapa de infra.

**Pendiente:** `user_id` en el contexto de las tres capas (con la sesión) y `version` del deploy en cada línea (etapa de infra). Rate limit en el Gateway (por IP, en Valkey). Bloquear una IP por abuso se resuelve con eso o, en AWS, con una regla de AWS WAF delante de CloudFront.

**Forma de trabajo:** desde esta tanda se trabaja con TDD: primero los tests, se los ve fallar por el motivo esperado, y después la implementación.


## 2026-11-15 · Rate limit en el Gateway (tanda 6)

El diseño general está en `docs/backlog.md` (tanda 6). Acá va lo que se decidió al implementar.

- **Tabla única:** `Backend/Gateway/src/Shared/RateLimit/RateLimits.ts` tiene el límite general (10 requests por segundo), las reglas propias por endpoint (`overrides`, con la clave `MÉTODO ruta` tal como se registró en el controller) y los endpoints exentos. `RATE_LIMIT_GENERAL_MAX` (opcional, entero entre 1 y 1.000.000) reemplaza el máximo general sin tocar el código.
- **Solo por IP por ahora.** Cada política es un objeto con una propiedad por dimensión (`{ perIp: { max, windowSeconds } }`): el límite por usuario (con la sesión) y el global por endpoint se agregan como propiedades nuevas, sin reescribir las reglas que ya existan. No se implementaron ahora porque ningún endpoint los necesita todavía.
- **A qué endpoint va un request:** el middleware corre antes del ruteo, así que Express todavía no dijo qué ruta atiende el request. La App recorre las rutas registradas al construirse (`listEndpoints`) y el middleware busca la que coincide usando los mismos matchers de Express, así `/expenses/1` y `/expenses/2` cuentan como `GET /expenses/:id` y la coincidencia es idéntica a la del ruteo (mayúsculas, barra final, `HEAD` atendido por la ruta `GET`). Si dos rutas se superponen, gana la primera registrada, igual que en Express.
  - **Costo:** usa la estructura interna del router de Express 5 (`stack`, `route`, `matchers`, `slash`), que no es API documentada. Esa estructura vive en el paquete `router`, que Express 5.3.0 pide como `^2.2.0`: fijar solo Express no alcanza, porque regenerar el lockfile podría traer otro `router`. Por eso Express está fijado a una versión exacta y `router` también, con un override en `pnpm-workspace.yaml` (`express>router: 2.2.0`, desde el 2026-11-22). `Endpoints.test.ts` falla si un upgrade cambia esa forma.
  - **Regla que sale de acá:** los routers se montan sin prefijo (`use(router)`), con la ruta completa en cada controller. Express no guarda el prefijo de un router montado, y sin él no se puede armar la ruta completa: la App no arranca si encuentra uno.
  - **Descartado:** aplicar el límite ruta por ruta en cada controller (fácil olvidarse en una ruta nueva) y contar por el path pedido (cada id sería un contador distinto, y un cliente podría crear contadores sin límite).
- **Rutas que no existen:** comparten una sola cuenta por IP (`unmatched`). Limita a quien escanea rutas y evita un contador por cada path inventado. Ahí caen también los `OPTIONS`: hoy no hay CORS (la App llama por el mismo origen); si se agrega, los preflights necesitan su propia regla.
- **Parámetro de ruta mal codificado** (`/expenses/%zz`): el matcher de Express lanza un error. El rate limit lo toma como coincidencia con esa ruta, así el request se cuenta en ella; si el error se propagara, esos requests saldrían sin contarse. Después Express corta el request, y ahora sale como 400 `MALFORMED_REQUEST` (antes habría sido un 500 con una línea de error en el log).
- **Rutas registradas con `router.all`:** son un endpoint con el método `ALL` (`ALL /ruta`), que atiende cualquier método.
- **La App no arranca si una regla o una exención apunta a una ruta que no existe:** una regla con la ruta mal escrita no se aplicaría nunca y nadie se enteraría. Es una validación al construir la App, más fuerte que el test que se había pensado: cubre también la tabla real en producción.
- **IPv6 por bloque /64:** a un cliente con IPv6 se le asigna un bloque /64 entero. Contando por dirección, podría cambiarla en cada request y no llegar nunca al límite. Una IPv4 escrita como IPv6 (`::ffff:1.2.3.4`, o en hexadecimal) cuenta como la IPv4.
- **Ventana fija:** la clave es `rate-limit:{cliente}:{endpoint}:{número de ventana}`. Cada ventana usa una clave nueva y la anterior vence sola. **Límite conocido:** un cliente puede hacer el máximo al final de una ventana y otra vez al principio de la siguiente (hasta el doble en un instante). Se acepta por simplicidad; una ventana deslizante lo evita si algún endpoint lo necesita. El número de ventana sale del reloj de cada instancia: con relojes desfasados, cerca del cambio de ventana dos instancias pueden contar en claves distintas. Con ventanas de segundos el efecto es chico; si importa, se toma la hora de Valkey dentro del script.
- **Contador en Valkey** (`ValkeyRateLimitStore`): un script Lua hace `INCR` y, si la clave es nueva, `EXPIRE`, en un solo paso atómico. Está registrado como comando del cliente, que manda solo el hash del script (`EVALSHA`) y no el texto en cada request. Detrás de la interfaz `IRateLimitStore`.
- **Contador en memoria** (`InMemoryRateLimitStore`): un `Map` del proceso. Es el valor por defecto de la App cuando no se le pasa otro y el respaldo cuando Valkey falla. Lo usan los tests unitarios, que así no necesitan Docker; y si alguien arma la App sin pasarle el contador, queda con un límite por proceso en vez de sin límite. Tiene un tope de 100.000 claves (unos pocos MB). Sin tope, un ataque desde muchas IPs crearía una clave por cada una dentro de la ventana. Con el tope lleno, primero se descartan las claves vencidas (la limpieza periódica corre a lo sumo una vez por segundo y puede haber vencidas ocupando lugar). Si sigue lleno, una clave nueva pasa sin contarse y queda un `warn` en el log, a lo sumo uno cada 30 s. Los conteos vigentes se conservan, así que quien ya está contado sigue limitado.
  - **Cuándo se llena:** cada clave vence `windowSeconds` después de su primer request (no al terminar su ventana), así que el mapa puede tener claves de la ventana actual y de la anterior. Se llena con 100.000 claves vigentes, con Valkey caído. **Corrección (2026-11-22):** antes decía que eso exigía 100.000 clientes distintos, y no es así. Una sola persona con un bloque IPv6 /48 (común en conexiones residenciales y servidores baratos) tiene 65.536 bloques /64, que cuentan como clientes distintos, y con dos endpoints ya pasa las 100.000 claves. O sea, con Valkey caído **un solo atacante** puede llenar el tope y dejar sin límite a las claves nuevas, incluido el login.
  - **La limpieza forzada** corre a lo sumo una vez cada 100 ms (la periódica, una por segundo): son hasta 10 pasadas por segundo sobre 100.000 claves, unos pocos ms de CPU. La primera versión recorría el mapa en cada request con clave nueva y el propio rate limit trababa al Gateway (20.000 claves nuevas con el tope lleno: 295 s). La segunda lo recorría solo si ya había vencido alguna clave, pero en un ataque las claves vencen de a una por milisegundo y volvía a recorrerlo casi siempre (59 s en el test). Las dos tienen su test.
  - **Descartado:** desplazar la clave más vieja, que fue la primera versión. Lo marcó la revisión de seguridad automática: borraba el conteo de alguien que ya había pasado su límite y se lo reiniciaba. También se descartó que las claves nuevas compartan un contador de desborde, que fue la segunda versión. Como cada cliente estrena clave en cada ventana, durante el ataque casi todos los clientes legítimos caían en ese contador y la instancia quedaba en 429. Además, el contador mezclaba ventanas de reglas distintas.
  - **Cerrado:** el respaldo es un modo degradado, sin promesas contra ataques (ver "2026-11-22 · El respaldo del rate limit es un modo degradado", al final).
- **Si Valkey no responde, se cuenta en memoria** (`FallbackRateLimitStore`, 2026-11-22): envuelve al contador de Valkey y, si falla, cuenta en el `InMemoryRateLimitStore` de la instancia. El límite queda más flojo (cada instancia cuenta por su lado, así que se multiplica por la cantidad de instancias y se reinicia con cada deploy), pero la API no se queda sin límite. Antes el request pasaba sin contarse; lo marcó la revisión de seguridad automática del commit, pensando sobre todo en login y recuperación de contraseña. El middleware conserva su propio `catch` por si el contador que recibe falla del todo. **Descartado:** rechazar los requests (503) con Valkey caído, porque tiraría toda la API; y usar solo memoria, sin Valkey, porque con varias instancias el límite real sería el configurado por la cantidad de instancias todo el tiempo. El cliente (`createValkeyClient`) está configurado para enterarse rápido: sin conexión un comando falla en el momento (no se encola) y con conexión tiene 250 ms para responder. El error se registra a lo sumo una vez cada 30 s, tanto el del contador como el de conexión: con Valkey caído fallan todos los requests y una línea por cada uno inundaría los logs. El Gateway arranca aunque Valkey esté caído.
- **Corte automático** (2026-11-22, en `FallbackRateLimitStore`): después de un fallo de Valkey, durante 5 s todo se cuenta en memoria sin consultarlo. Vencido ese tiempo, un solo request prueba a Valkey mientras los demás siguen en memoria: si responde, se vuelve a Valkey y queda un `info` en el log; si falla, se corta otros 5 s. Solo la prueba cierra el corte: la respuesta tardía de un request que salió antes de abrirlo no cuenta, porque si no, con Valkey lento el corte se abriría y cerraría todo el tiempo. **Tope de 1 s por consulta:** cada consulta a Valkey compite con un temporizador de 1 s (por encima de los 250 ms del cliente). Si gana el temporizador, cuenta como fallo: el request sigue en memoria, se abre el corte y queda el `error` en el log. Es por si una consulta no termina nunca: sin el tope, ese request quedaba colgado y, con el corte cerrado, ninguno terminaba. Una versión anterior usaba un plazo por reloj solo para la prueba, que liberaba el corte pero dejaba colgado el request; el temporizador lo reemplaza. El corte se abre con un solo fallo, así que un pico aislado de más de 250 ms hace contar por instancia durante 5 s. Se acepta: abrirlo recién tras varios fallos seguidos haría esperar a más requests cuando Valkey se cuelga. Sin el corte, con Valkey conectado pero colgado cada request esperaba los 250 ms del timeout. Con el corte esperan solo los requests de los primeros 250 ms de la caída (hasta que el primero falla, nadie sabe que Valkey no contesta) y después uno cada 5 s por instancia. Con Valkey sin conexión no espera nadie: el cliente falla en el acto. **Límite conocido:** un request cuyo comando vence por timeout puede quedar contado dos veces, si Valkey igual hace el `INCR` después de que el cliente dejó de esperar, y también en memoria. Pasa a lo sumo en el request que abre cada corte, así que el efecto es chico. **Límite conocido:** un request común que salió antes de que Valkey volviera y falla tarde (dentro de su segundo de tope) puede reabrir el corte justo después de la recuperación. Dura 5 s y se recupera solo. **Descartado:** contar en memoria y sincronizar con Valkey cada tanto. Evita la espera, pero entre sincronizaciones cada instancia solo ve su propio conteo, y con ventanas de 1 s habría que sincronizar varias veces por segundo.
- **Cliente:** `iovalkey`, el fork de `ioredis` que mantiene el proyecto Valkey, en JavaScript puro. **Descartado:** `@valkey/valkey-glide` (el cliente oficial nuevo, con un binario nativo en Rust que complica la imagen de Docker), `ioredis` y `redis` (son los clientes de Redis; funcionan con Valkey, pero su compatibilidad a futuro depende de otra empresa). Como el contador está detrás de una interfaz, cambiar de cliente toca dos archivos.
- **`VALKEY_URL`** (obligatoria): `redis://` en local y `rediss://` (TLS) en AWS. Si no es una URL de ese tipo con host, el Gateway no arranca (sin host el cliente se conectaría a localhost sin avisar); el mensaje de error no muestra el valor, que puede traer una contraseña.
- **Orden de los middlewares:** contexto, log del request, helmet, rate limit, lectura del body. Así un 429 queda en el log con su IP, sale con los headers de seguridad, y un request rechazado no llega a leerse.
- **Respuesta:** 429 `TOO_MANY_REQUESTS` con `Retry-After` (los segundos que le quedan a la ventana). `TOO_MANY_REQUESTS` es un código que solo decide el Gateway: si lo devuelve una capa de abajo llega como `INTERNAL`, igual que `MALFORMED_REQUEST` y `PAYLOAD_TOO_LARGE`.
- **dependency-cruiser:** la regla que prohibía los clientes de Redis fuera de DataAccess se separó en dos. La base la sigue tocando solo DataAccess; Valkey lo pueden usar el Gateway y DataAccess, y Business no.
- **CI:** el job de integración levanta también Valkey y corre los tests de integración del Gateway.

**Para la etapa de infra:**
- ElastiCache Valkey con cifrado en tránsito: `VALKEY_URL` con `rediss://`. Si se elige la variante serverless (o cualquiera en modo cluster), el cliente tiene que ser el de cluster de `iovalkey` y no el simple: definirlo al elegir la variante. El script del contador usa una sola clave, así que funciona en los dos modos.
- El security group de Valkey solo acepta conexiones desde el Gateway (y desde DataAccess cuando tenga su cache).
- El rate limit por IP depende de que `client_ip` sea la IP real: vale todo lo anotado para `TRUSTED_PROXY_HOPS`.
- Alarma en CloudWatch sobre el mensaje `rate limit store failed`: mientras aparece, cada instancia limita por su cuenta y el límite real se multiplica por la cantidad de instancias. También sobre `rate limit memory store full`: mientras aparece, las claves nuevas pasan sin límite.
- **AWS WAF delante del ALB, con reglas de límite por IP** (rate-based rules): es la protección contra un ataque distribuido. Funciona aunque Valkey esté caído, no usa memoria del Gateway y puede agrupar por bloques más grandes. El rate limit del Gateway queda para los límites finos por endpoint y, más adelante, por usuario. Revisar el costo antes de prenderlo (se cobra por regla y por millón de requests).

**Revisiones (code-review, seguridad, semgrep, Codex):** sin vulnerabilidades. De ahí salieron el orden de registro al resolver rutas superpuestas, el manejo del parámetro mal codificado, `router.all`, la IPv4 en hexadecimal, el host obligatorio en `VALKEY_URL`, `EVALSHA` y que la App resuelva la tabla de límites una sola vez. Para login y recuperación de contraseña, el respaldo en memoria ya cubre la caída de Valkey (ver arriba); si en esos endpoints hace falta algo más estricto, se decide en su tanda.

## 2026-11-16 · Las traducciones viven en `core`

**Regla:** todo texto que llega al usuario final pasa por la traducción, con su clave y su texto en `core`. Un mensaje que no llega al usuario (un error de arranque, el detalle interno de un `AppError`, un log) puede ir escrito directo en el código.

**Decisión:** los textos de cada idioma y la traducción salen del Gateway y pasan a `Packages/core/src/Translations`:

- `Translations.ts`: la forma de un archivo de idioma (hoy, un mensaje por cada `ErrorCode`).
- `es/translation.ts`: los textos en español. Cada idioma nuevo es otro archivo con la misma forma.
- `TranslationKeys.ts`: la misma forma, con la ruta de cada texto como valor. El código pide un texto con `TranslationKeys.errors.NOT_FOUND` en vez de armar la ruta a mano.

- `CreateTranslator.ts`: `createTranslator(logger)` inicia i18next con esos archivos y devuelve una función `translate(clave, idioma)`. Si una clave no tiene texto, devuelve el mensaje genérico y deja un `warn` en el log, para que el usuario no reciba la clave cruda.

El Gateway sigue siendo el único que traduce: crea el traductor al construir la App y arma el mensaje en el manejador de errores. Ya no depende de i18next.

**Por qué:** los textos son un contrato compartido, igual que los códigos de error, que ya están en `core`. Con todo en un lugar, un código o un texto nuevo obliga por tipos a cargarlo en cada idioma y en las claves, y un test verifica que cada clave apunte a un texto que existe. Si otra capa necesita una clave (por ejemplo, para un mensaje de validación), la toma del mismo lugar.
**A tener en cuenta:** i18next pasa a ser dependencia de `core` y deja de serlo del Gateway. La App no puede importar `core`; sus textos de interfaz son otros y van en la App.

## 2026-11-22 · Mutation testing con Stryker (Gateway)

**Decisión:** cada cambio de código pasa, antes de llegar a revisión, por los controles del skill `ub-mode`: tipos, lint, tests con cobertura, CRAP, duplicación y mutation testing sobre lo tocado. Para el mutation testing se sumó Stryker al Gateway (`@stryker-mutator/core` y `@stryker-mutator/jest-runner`, versión exacta, devDependencies). Se corre solo sobre los archivos tocados: `pnpm --filter @expense-tracker/gateway mutation --mutate <archivo>,<archivo>`. Los otros paquetes lo suman cuando tengan un cambio que lo necesite.

Lo que hizo falta para que corra en este repo (está comentado en `stryker.config.mjs`):
- **TS 7 sin API JS:** Stryker reescribe el tsconfig de su copia con la API de TypeScript, y falla. Ese paso solo corre si el archivo existe, así que `tsconfigFile` apunta a uno inexistente. Tampoco hay checker de tipos: un mutante que no compilaría puede quedar como sobreviviente y se revisa a mano.
- **pnpm:** Stryker no encuentra solo sus plugins, así que se nombran en `plugins`.
- **La copia del paquete:** Stryker corre en `.stryker-tmp/`, donde la ruta relativa a `jest.swc.cjs` de la raíz no existe. La config de Jest se carga desde la carpeta real en `stryker.config.mjs`, y `configFile` apunta a `package.json` para que Stryker no vuelva a cargar `jest.config.js` en la copia.

**Por qué:** la cobertura dice qué líneas corren, no si los tests controlan lo que hacen. En el primer cambio con Stryker (el respaldo del rate limit) sobrevivieron 5 mutantes reales, por ejemplo que una prueba vencida que responde tarde liberara a la prueba nueva. Ahora tienen su test.
**A tener en cuenta:** los sobrevivientes que son ruido (textos y campos de log, mutantes equivalentes, bordes de 1 ms) se informan y no se persiguen. Falta decidir si Stryker entra al CI (ver "Controles de calidad automáticos" en `docs/backlog.md`).

## 2026-11-22 · El respaldo del rate limit es un modo degradado

**Decisión (cerrada):** el respaldo en memoria del rate limit (`FallbackRateLimitStore` + `InMemoryRateLimitStore`) no promete nada contra ataques. Con el tope de claves lleno, las claves nuevas pasan sin contarse. La protección contra un ataque distribuido es AWS WAF delante del ALB (ver "Para la etapa de infra" en la sección del rate limit).
**Por qué:** ningún contador por instancia con memoria acotada frena un ataque distribuido. Frente a suficientes IPs, o deja pasar o bloquea a todos. Cada diseño probado tenía su agujero, y las revisiones automáticas marcaron los tres: desplazar la clave más vieja, un contador de desborde compartido y dejar pasar.
**A tener en cuenta:** si una revisión vuelve a marcar que el respaldo deja pasar o bloquea, ya está decidido acá. Las revisiones siguen sirviendo para buscar errores en el código del respaldo. Queda para la tanda 7: que una regla de la tabla pueda pedir rechazar con el tope lleno o con Valkey caído, pensado para login y recuperación de contraseña.
