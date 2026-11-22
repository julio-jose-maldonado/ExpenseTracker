# Backlog

## Contexto

Anotador de gastos web (responsive) para uso personal: cada usuario se registra y ve solo sus gastos.
Proyecto de práctica para aprender a desplegar en AWS y practicar gRPC.

- **Stack:** ver `CLAUDE.md`.
- **Decisiones caras:** multi-idioma (es por defecto, en opcional, por usuario) · multi-moneda (ARS, USD, EUR; totales separados por moneda, sin conversión) · arquitectura de 3 capas con gRPC.

## Historias

1. Como persona nueva, quiero registrarme con email y contraseña, anotar un gasto en pesos y verlo en mi lista, para empezar a llevar mis gastos.
2. Como usuario, quiero iniciar y cerrar sesión, para entrar a mis gastos desde cualquier dispositivo sin que otros los vean. Requires: #1
3. Como usuario, quiero editar un gasto, para corregir lo que anoté mal. Requires: #1
4. Como usuario, quiero borrar un gasto, para sacar lo que anoté por error. Requires: #1
5. Como usuario, quiero anotar gastos en dólares o euros, para registrar lo que gasto en otras monedas. Requires: #1
6. Como usuario, quiero ver el total del mes separado por moneda, para saber cuánto gasté. Requires: #1
7. Como usuario, quiero ver el total del mes por categoría, para saber en qué se me va la plata. Requires: #6
8. Como usuario, quiero ver la lista y los totales de meses pasados (por defecto se ve el actual), para comparar cómo vengo gastando. Requires: #6
9. Como usuario, quiero recuperar mi contraseña por email, para no perder mis datos si me la olvido. Requires: #2
10. Como usuario, quiero elegir entre español e inglés, para usar la app en mi idioma. Requires: #1

### Después de la v1

11. Como usuario, quiero crear, editar y borrar mis propias categorías, para organizar los gastos a mi manera. Requires: #1
12. Como usuario, quiero ver cuánto es en pesos un gasto en dólares o euros según la cotización oficial, para entender cuánto me costó realmente. Requires: #5

## Notas

- Las categorías van en su propia tabla desde la v1 (con las fijas precargadas), para que la #11 no requiera migrar datos.
- La #9 suma SES en AWS (modo sandbox alcanza para practicar).
- #1, #2 y #9: no revelar si un email existe (mismo mensaje y una verificación de hash aunque el usuario no exista). Código o link de recuperación de un solo uso, con límite de intentos, y al resetear se cierran las sesiones abiertas.

## Plan de tandas

La historia #1 se hace en varias tandas, cada una con su PR. Se trabaja con TDD.

| Tanda | Qué entra | Estado |
|---|---|---|
| 5 | Errores y deadline entre capas por gRPC, contexto del request (IP, método gRPC), logs por salto | Hecha |
| 6 | Rate limit en el Gateway, con el cliente de Valkey | Hecha |
| 7 | Registro: primera migración, `Packages/types`, argon2id, express-validator | Siguiente |
| 8 | Sesión: cookie `httpOnly` guardada en Valkey, middleware de autenticación (login y logout quedan para la historia #2) | |
| 9 | Gastos: migración de categorías y gastos, crear y listar por usuario, pantallas de la App | |

### Tanda 6 · Rate limit (definido el 2026-11-15)

- **Una política por request:** hay un límite general por defecto y un endpoint puede tener el suyo, más alto o más bajo, que reemplaza al general. Ejemplo: general 10 por segundo, endpoint A 20, endpoint B 5.
- **Todos los límites en una tabla**, en un solo archivo del Gateway: la política general y las reglas propias por método y ruta. Un único middleware, antes de las rutas, elige la política. Un test verifica que cada regla propia coincida con una ruta que existe.
- **Contadores por endpoint:** cada endpoint lleva su propia cuenta; los requests a un endpoint no gastan el cupo de otro.
- **Por IP** (`client_ip` del contexto). El diseño tiene que permitir otras dos dimensiones, a decidir al implementar:
  - un límite global por endpoint (todos los clientes sumados), para proteger a las capas de abajo. Riesgo: un solo cliente puede agotarlo y dejar afuera al resto, así que tendría que ser bastante más alto que el límite por IP;
  - un límite por usuario, recién cuando exista la sesión (tanda 8), porque antes no hay un `user_id` confiable.
- **Si Valkey no responde, se cuenta en memoria** por instancia y se registra un error: una caída de Valkey no puede tirar toda la API, pero tampoco dejarla sin límite.
- **Hecho a mano**, sin librería: ventana fija con un contador en Valkey. El incremento y el vencimiento de la clave se hacen en una sola operación atómica (script Lua con `INCR` + `EXPIRE`), y la clave incluye el número de ventana, así un contador nunca queda sin vencimiento ni bloquea a alguien para siempre.
- **Respuesta:** 429 con el código `TOO_MANY_REQUESTS` y el header `Retry-After`.
- `/isAlive` queda exento (lo consulta el balanceador). El límite general se puede cambiar por variable de entorno; las reglas propias van en el código.

**Hecha el 2026-11-15.** Lo que se decidió al implementar está en `docs/Decisiones_Tecnicas.md`. Quedó para más adelante:

- Límite por usuario: con la sesión (tanda 8).
- Límite global por endpoint: cuando haya un endpoint que lo necesite. Se agrega como una propiedad más de la política (`RateLimitPolicy`).
- Reglas propias más bajas para registro y login: con cada uno de esos endpoints (tandas 7 y 8).

### Aviso de request lento (definido el 2026-11-15, entra con la tanda 7)

- Cuando un request tarda más de un umbral, su línea de log sale como `warn` en vez de `info`. Sirve para saber si un error que vio el usuario en la App se debió a que el backend tardó en resolver.
- **El umbral va atado al tiempo que espera la App:** una constante compartida en `Packages/types` (se crea en la tanda 7), que la App usa para cortar el `fetch` y el Gateway para decidir el aviso. Hoy la App no tiene un tiempo máximo de espera: se agrega en ese momento.
- Lo mismo en la línea de cierre de cada salto gRPC (Business y DataAccess), para ver cuál capa fue la lenta.


### Controles de calidad automáticos (anotado el 2026-11-19, a aplicar pronto)

Idea tomada de Uncle Bob, que no lee el código de sus agentes y en su lugar lo hace pasar por tests y métricas. Acá **no reemplaza la revisión**: la idea es que lo que llegue a revisión ya haya pasado todos los controles automáticos, para que la revisión se concentre en el diseño y en si la implementación es la que se quería. Conviene meterlo ahora, con poco código: los límites arrancan desde el inicio en vez de tener que arreglar deuda después.

Ya existe: typecheck, tests unitarios y de integración, oxlint (`correctness`, `suspicious`), dependency-cruiser con reglas de arquitectura, gitleaks en CI. Falta:

- **Cobertura mínima** por paquete (`coverageThreshold` de Jest y Vitest), que haga fallar los tests si baja.
- **Complejidad y tamaño:** activar en oxlint `complexity`, `max-lines-per-function`, `max-depth` y `max-params` (la versión 1.92 ya las trae).
- **Mutation testing con Stryker**, sobre los archivos que cambiaron, antes del push. Las mutaciones que sobreviven dicen exactamente qué no controlan los tests.

Cómo se arma:

1. **Medir primero, sin cambiar nada:** cobertura actual de cada paquete, la función más compleja y la más larga, y una corrida de Stryker sobre un módulo chico (porcentaje y tiempo). Los límites salen de esos números, no de valores inventados: desde ahí solo pueden mejorar, y se ajustan de a poco.
2. **Nivel 1, en cada cambio antes de pasarlo a revisión:** un script `pnpm quality` (typecheck, tests con cobertura mínima, lint con límites, dependency-cruiser). Se puede forzar con un hook de Claude Code para que un cambio no se dé por terminado si falla.
3. **Nivel 2, antes del push:** Stryker sobre los archivos cambiados, y después las revisiones de siempre (`code-review`, `security-review`, semgrep, segunda opinión con Codex o Gemini).
4. **CI:** cobertura y límites de complejidad entran solos, porque ya corren `test` y `lint`. Stryker no en cada push, porque es lento: a decidir si va en un job manual o semanal.
5. **Al pasar un cambio a revisión,** acompañarlo de un resumen corto: controles en verde, porcentaje de mutaciones detectadas en los archivos tocados y las que sobrevivieron.
