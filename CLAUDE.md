# ExpenseTracker

Anotador de gastos web (responsive). Cada usuario se registra y ve solo sus gastos.
Es un proyecto de práctica: el objetivo real es aprender a desplegar en AWS y practicar gRPC,
por eso la arquitectura es más compleja de lo que el dominio necesita (a propósito).

## Arquitectura

Tres capas, un contenedor Docker por capa, comunicación interna por gRPC:

```
Frontend (React) ──REST──▶ 1. Gateway ──gRPC──▶ 2. Negocio ──gRPC──▶ 3. Acceso a datos ──▶ PostgreSQL
                              │                                          │
                              └── Redis (sesiones)                       └── Redis (cache general)
```

1. **Gateway**: única puerta pública. Rutas REST, validación de entrada, auth/sesión, rate limit. Sin lógica de negocio.
2. **Negocio**: reglas del dominio (aislamiento por usuario, totales por moneda/categoría).
3. **Acceso a datos centralizada**: único componente que toca Postgres. Dueño de la cache general en Redis.

## Estructura de carpetas

```
ExpenseTracker/      workspace pnpm (los comandos se corren desde la raíz)
├── App/             web app (React)
├── Backend/
│   ├── Gateway/
│   ├── Business/
│   └── DataAccess/
└── Packages/
    ├── types/       contrato HTTP compartido App ↔ Gateway (se crea en la historia #1)
    ├── proto/       contratos gRPC (solo backend)
    └── core/        errores, logger, contexto (solo backend)
```

## Stack

| Capa | Elección |
|---|---|
| Backend | Node + TypeScript + Express (Gateway), gRPC entre capas |
| Base de datos | PostgreSQL (RDS en AWS) |
| Cache | Redis: sesiones (Gateway) y cache general (capa de datos). Docker en local, ElastiCache Valkey en AWS |
| ORM | Drizzle ORM + `pg`, solo en DataAccess. Migraciones SQL con `drizzle-kit` |
| Frontend | React + Vite + TypeScript, responsive, i18n (es por defecto, en). TanStack Query (estado del servidor), shadcn/ui + Tailwind, React Hook Form, Zustand (solo estado de UI) |
| Repo | Un repo, workspace pnpm en la raíz: `App/`, `Backend/*`, `Packages/*` |
| Infra | AWS CDK en TypeScript: ECS Fargate (3 servicios) + RDS + ElastiCache + S3/CloudFront, ALB solo delante del Gateway |

## Comandos (desde la raíz)

- `pnpm build` · `pnpm typecheck` · `pnpm test` · `pnpm lint` · `pnpm depcruise`
- `docker compose up -d --wait` (Postgres + Valkey) · `pnpm --filter @expense-tracker/data-access test:integration` · `... db:generate` / `db:migrate`
- App: `pnpm --filter @expense-tracker/app dev` (http://localhost:5173, proxy `/api` → Gateway). Tests del front con Vitest.
- Variables y pasos para levantar todo: `docs/Desarrollo_Local.md`

## Documentación a mantener

- `docs/API_Frontend.md`: contrato HTTP App ↔ Gateway. Si cambia, entrada arriba en su changelog con SHA completo + fecha.
- `Backend/CHANGELOG.md`: una entrada por commit antes del push (`### YYYY-MM-DD · shortsha`), con sub-sección Dependencias si toca algún `package.json`.
- `docs/Decisiones_Tecnicas.md`: decisiones nuevas al final, con el porqué.
- `docs/CHANGELOG_Pull_Requests.md`: título y descripción (en inglés) de cada PR, el más nuevo arriba, escritos al preparar el PR.

## Decisiones técnicas

- TypeScript 7 para compilar y chequear tipos (`tsc` en script `typecheck`). Módulos CommonJS (`module: nodenext` + `"type": "commonjs"`).
- Jest transforma con SWC (`@swc/jest`, legacy decorators + decoratorMetadata), no ts-jest: TS 7.0 no tiene API JS. Jest no chequea tipos, lo hace `typecheck`.
- Sin ts-node: dev con `tsc --watch` + `node --watch` sobre `dist`.
- Lint con **oxlint** (no ESLint: typescript-eslint y @swc-node/register piden TS `<7`). Volver a evaluar typescript-eslint cuando salga TS 7.1 con API JS.
- dependency-cruiser con `parser: "swc"` para hacer cumplir las capas (no necesita la API de TS).
- gRPC con `@grpc/grpc-js` + tipos generados con `ts-proto` (vía `buf`), contratos en `Packages/proto`.
- Tests: Jest + supertest (con SWC).
- Base: Drizzle ORM + `pg` (reemplaza a TypeORM). Esquema en TS, un archivo por dominio dentro de DataAccess; tipos con `$inferSelect`/`$inferInsert` que no salen de DataAccess. Migraciones `.sql` generadas con `drizzle-kit`, aplicadas por el rol `migrator`.
- Auth a mano (no Better Auth: necesita acceso directo a la base y rompe la regla de que solo DataAccess toca Postgres). Sesión en cookie `httpOnly` manejada por el Gateway, guardada en Redis.
- Reglas de validación compartidas (largo y regex de contraseña, monedas) como constantes en `Packages/types`: las usan express-validator en el Gateway y React Hook Form en la App. Sin zod.
- Contraseñas: argon2id.
- Validación en el Gateway: express-validator.
- Errores: Negocio y Datos devuelven **códigos** de error (nunca textos) por gRPC; el Gateway los traduce con i18next al idioma del usuario. Los mensajes de validación también son claves de traducción.

## Decisiones de producto

- Registro abierto con email y contraseña; cada usuario ve solo sus datos.
- Sin organizaciones, sin roles, sin modo offline.
- Idioma por usuario: español (default) o inglés.
- Monedas: ARS, USD, EUR. Total del mes separado por moneda, sin conversión.
- Cotización oficial (API BCRA) para mostrar el equivalente en pesos: después de la v1.
- Categorías fijas en la v1, pero guardadas en su propia tabla (no hardcodeadas) para sumar un CRUD por usuario después sin migrar datos.
- Lista y totales muestran el mes actual por defecto, con opción de ver meses pasados.
- Recuperar contraseña por email entra en la v1 (en AWS: SES).

## AWS

- Destruir el stack al terminar cada sesión de práctica (prendido todo el mes: ~USD 80–95).
- ElastiCache: usar Valkey (no Redis OSS Serverless, que tiene mínimo de 1 GB y es caro).
