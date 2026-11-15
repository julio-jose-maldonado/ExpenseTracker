# API HTTP para el frontend

Contrato entre la App (React) y el Gateway, la única capa pública del backend.
Las capas internas (Business, DataAccess) no se exponen: el frontend solo habla con el Gateway.

## Changelog del contrato

La entrada más nueva arriba, con el SHA completo y la fecha del commit que cambió el contrato.

### 2026-11-14 · _sha pendiente_

- La App llama al Gateway por `/api` en su mismo origen (proxy de Vite en local, CloudFront en AWS). Las rutas del Gateway no cambian: el prefijo se saca antes de llegar.

### 2026-11-14 · d885c8936b77ab6586c0a8dda2e6dfdffb1ae85c

- Contrato inicial: formato de respuesta, códigos de error, `x-request-id`, `GET /isAlive` y `GET /isAliveChain`.

---

## Generalidades

| Tema | Valor |
|---|---|
| Base URL desde la App | `/api` en el mismo origen: `fetch('/api/isAliveChain')`. Vite (local) y CloudFront (AWS) reenvían al Gateway sin el prefijo |
| Gateway directo (local) | `http://localhost:3000` (puerto: `PORT` en `Backend/Gateway/.env`), para probar con curl. Las rutas de abajo son las del Gateway, sin `/api` |
| Formato | JSON (`Content-Type: application/json`), body de hasta **50 kb** |
| Autenticación | Todavía no hay. Llega con las historias #1 y #2: sesión en cookie `httpOnly` manejada por el Gateway (el frontend no guarda tokens) |
| Idioma de los mensajes | Español por ahora. Con la historia #10, el idioma del usuario |

**Tipos compartidos:** a partir de la historia #1, los bodies y respuestas van a estar tipados en el paquete `@expense-tracker/types` (`Packages/types`), que usan la App y el Gateway. Mientras no exista, las formas van escritas acá.

## Formato de respuesta

**Éxito:** status 2xx y el resultado dentro de `data`.

```json
{ "data": { "ok": true } }
```

**Error:** el status HTTP real (nunca 200 con un flag de error) y un objeto `error`.

```json
{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "El servicio no está disponible en este momento. Intentá de nuevo más tarde." } }
```

- `code`: estable, en inglés. **Es lo que el frontend tiene que usar para decidir qué hacer.**
- `message`: texto ya traducido, listo para mostrar. Puede cambiar de redacción sin aviso; no compararlo.

## Códigos de error

| `code` | HTTP | Cuándo | Mensaje (es) |
|---|---|---|---|
| `MALFORMED_REQUEST` | 400 | El body no es JSON válido o tiene un encoding no soportado | La solicitud no tiene un formato válido. |
| `NOT_FOUND` | 404 | La ruta no existe | El recurso solicitado no existe. |
| `PAYLOAD_TOO_LARGE` | 413 | El body supera los 50 kb | La solicitud es demasiado grande. |
| `INTERNAL` | 500 | Error inesperado | Ocurrió un error inesperado. Intentá de nuevo más tarde. |
| `SERVICE_UNAVAILABLE` | 503 | Una capa interna o la base no responde | El servicio no está disponible en este momento. Intentá de nuevo más tarde. |

**Sugerencia para la App:** 503 y 500 se pueden reintentar más tarde; 400, 404 y 413 no, porque el mismo request va a fallar igual.

## Headers

| Header | Dirección | Detalle |
|---|---|---|
| `x-request-id` | request (opcional) y response | Identificador del request para rastrearlo en los logs de las tres capas. Si el frontend manda uno válido (`^[A-Za-z0-9-]{1,64}$`), el Gateway lo usa; si no, genera un UUID. Siempre vuelve en la respuesta: conviene mostrarlo o loguearlo cuando algo falla, para poder buscarlo. |

## Endpoints

### `GET /isAlive`

Chequea que el Gateway esté vivo, sin consultar las otras capas.

**Respuesta 200**

```json
{ "data": { "ok": true } }
```

### `GET /isAliveChain`

Chequea la cadena completa: Gateway → Business → DataAccess → PostgreSQL.

**Respuesta 200**

```json
{ "data": { "ok": true } }
```

**Errores**

| HTTP | `code` | Cuándo |
|---|---|---|
| 503 | `SERVICE_UNAVAILABLE` | Alguna capa interna o la base no responde (corte a los 3 s por salto) |
