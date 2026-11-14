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
