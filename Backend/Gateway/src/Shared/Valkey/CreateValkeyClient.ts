import type { Logger } from '@expense-tracker/core';
import { Redis } from 'iovalkey';

// Lo que usa Valkey está en el camino de cada request: si no responde, hay que enterarse rápido.
const COMMAND_TIMEOUT_MS = 250;
const CONNECT_TIMEOUT_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 5_000;
// Mientras Valkey está caído hay un error por cada intento de reconexión: un aviso cada tanto alcanza.
const ERROR_LOG_INTERVAL_MS = 30_000;

// Cliente de Valkey del Gateway (iovalkey mantiene el nombre de clase `Redis` de ioredis).
export function createValkeyClient(url: string, logger: Logger): Redis {
  const client = new Redis(url, {
    commandTimeout: COMMAND_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Sin conexión, un comando falla en el momento en vez de quedar en cola hasta que vuelva.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: (attempt) => Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });

  // Sin un listener de 'error', Node tira el proceso con el primer error de conexión.
  // Reloj monotónico: un ajuste de la hora del sistema no puede silenciar el aviso.
  let nextErrorLogAtMs = 0;
  client.on('error', (error: Error) => {
    if (performance.now() < nextErrorLogAtMs) return;
    nextErrorLogAtMs = performance.now() + ERROR_LOG_INTERVAL_MS;
    // Solo nombre, código y mensaje: el error no incluye la URL, que puede traer la contraseña.
    logger.error({ error_name: error.name, error_code: (error as NodeJS.ErrnoException).code, error_message: error.message }, 'valkey connection error');
  });
  return client;
}
