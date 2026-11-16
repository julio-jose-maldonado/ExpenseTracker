# Desarrollo local

Comandos desde la raíz, salvo que se indique otra cosa.

## 1. Variables de entorno

Los archivos `.env` no se versionan. Hay uno en la raíz (lo usa docker compose) y otro en cada servicio, y cada uno se crea copiando el `.env.example` de su carpeta:

```sh
for dir in . Backend/DataAccess Backend/Business Backend/Gateway; do cp -n "$dir/.env.example" "$dir/.env"; done
```

Los `.env.example` vienen vacíos: los valores se completan con las tablas de abajo. Las contraseñas se eligen una vez, y las de los roles tienen que coincidir entre la raíz y DataAccess.

**`.env` (raíz, docker compose)**

| Variable | Ejemplo | Nota |
|---|---|---|
| `POSTGRES_PORT` | `5433` | Puerto en el host (opcional, default 5433) |
| `POSTGRES_SUPERUSER_PASSWORD` | — | Superusuario `postgres`, solo para administrar |
| `MIGRATOR_PASSWORD` | — | Rol `expense_migrator` |
| `APP_PASSWORD` | — | Rol `expense_app` |
| `VALKEY_PORT` | `6380` | Puerto en el host (opcional, default 6380) |

**`Backend/DataAccess/.env`**

| Variable | Ejemplo |
|---|---|
| `GRPC_PORT` | `50052` |
| `DATABASE_HOST` | `localhost` |
| `DATABASE_PORT` | `5433` |
| `DATABASE_NAME` | `expense_tracker` |
| `DATABASE_USER` | `expense_app` |
| `DATABASE_PASSWORD` | el mismo que `APP_PASSWORD` |
| `MIGRATOR_DATABASE_USER` | `expense_migrator` (solo drizzle-kit y tests de integración) |
| `MIGRATOR_DATABASE_PASSWORD` | el mismo que `MIGRATOR_PASSWORD` |

**`Backend/Business/.env`**: `GRPC_PORT=50051` · `DATA_ACCESS_GRPC_ADDRESS=localhost:50052`

**`Backend/Gateway/.env`**: `PORT=3000` · `BUSINESS_GRPC_ADDRESS=localhost:50051` · `TRUSTED_PROXY_HOPS` vacío (opcional: cuántos proxies propios hay delante del Gateway; en local, ninguno)

## 2. Levantar

```sh
docker compose up -d --wait       # Postgres + Valkey (crea los roles en el primer arranque)
pnpm build
pnpm --filter @expense-tracker/data-access db:migrate   # cuando haya migraciones (desde la historia #1)

# una terminal por servicio
pnpm --filter @expense-tracker/data-access start
pnpm --filter @expense-tracker/business start
pnpm --filter @expense-tracker/gateway start

# la App (otra terminal): http://localhost:5173
pnpm --filter @expense-tracker/app dev
```

La App llama a `/api/...` y Vite lo reenvía al Gateway sin el prefijo. Si el Gateway no está en `http://localhost:3000`, se cambia con la variable `GATEWAY_URL` al levantar Vite.

## 3. Probar

```sh
curl localhost:3000/isAlive        # solo el Gateway
curl localhost:3000/isAliveChain   # Gateway → Business → DataAccess → Postgres
pnpm test                          # unitarios del backend (Jest) y de la App (Vitest), sin Docker
pnpm --filter @expense-tracker/data-access test:integration   # contra el Postgres del compose
```

Los tests de integración y drizzle-kit toman las variables de `Backend/DataAccess/.env`.

## 4. Apagar

```sh
docker compose down      # conserva los datos
docker compose down -v   # borra el volumen: los roles se vuelven a crear con las contraseñas del .env
```
