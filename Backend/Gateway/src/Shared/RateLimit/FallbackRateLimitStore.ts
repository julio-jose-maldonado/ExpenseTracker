import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Con el principal caído fallan todos los requests: un aviso cada tanto alcanza.
const FAILURE_LOG_INTERVAL_MS = 30_000;

// Después de un fallo, cuánto tiempo se cuenta directo en memoria sin consultar al principal. Con
// Valkey colgado cada consulta espera el timeout del cliente (250 ms): así lo espera una sola por corte.
const OPEN_MS = 5_000;

// Plazo propio de la prueba: si el principal no responde ni falla (una promesa que nunca termina),
// la prueba no puede dejar el corte abierto para siempre.
const PROBE_TIMEOUT_MS = 1_000;

export interface FallbackRateLimitStoreDependencies {
  primary: IRateLimitStore;
  fallback: IRateLimitStore;
  logger: Logger;
  now?: () => number;
}

// Cuenta en el principal (Valkey, compartido entre instancias) y, si falla, en el respaldo (memoria
// del proceso). Con el respaldo cada instancia cuenta por su lado: el límite queda más flojo
// (multiplicado por la cantidad de instancias), pero la API no se queda sin límite.
// Corte automático: tras un fallo, durante OPEN_MS todo va al respaldo. Vencido ese tiempo, un solo
// request prueba al principal mientras los demás siguen en memoria; si responde se vuelve a Valkey,
// si falla (o no responde en PROBE_TIMEOUT_MS) se corta otra vez. Solo la prueba cierra el corte: la
// respuesta tardía de un request que salió antes de abrirlo no cuenta.
export class FallbackRateLimitStore implements IRateLimitStore {
  readonly #primary: IRateLimitStore;
  readonly #fallback: IRateLimitStore;
  readonly #logger: Logger;
  readonly #now: () => number;
  #nextFailureLogAtMs = 0;
  // 0: cerrado (se consulta al principal). Otro valor: hasta cuándo dura el corte.
  #openUntilMs = 0;
  // Prueba en curso: su número (para ignorar el resultado de una prueba vencida) y su plazo.
  #probeId = 0;
  #probing = false;
  #probeDeadlineMs = 0;

  constructor({ primary, fallback, logger, now = Date.now }: FallbackRateLimitStoreDependencies) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#logger = logger;
    this.#now = now;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.#shouldUseFallback()) return this.#fallback.increment(key, ttlSeconds);

    const probeId = this.#openUntilMs !== 0 ? this.#startProbe() : undefined;
    try {
      const count = await this.#primary.increment(key, ttlSeconds);
      this.#closeIfCurrentProbe(probeId);
      return count;
    } catch (error) {
      this.#open(error);
      return this.#fallback.increment(key, ttlSeconds);
    } finally {
      if (this.#isCurrentProbe(probeId)) this.#probing = false;
    }
  }

  // Corte abierto, o una prueba en curso. Una prueba que pasó su plazo cuenta como fallo.
  #shouldUseFallback(): boolean {
    if (this.#probing && this.#now() >= this.#probeDeadlineMs) {
      this.#probing = false;
      this.#openUntilMs = this.#now() + OPEN_MS;
    }
    return this.#probing || this.#now() < this.#openUntilMs;
  }

  #startProbe(): number {
    this.#probeId += 1;
    this.#probing = true;
    this.#probeDeadlineMs = this.#now() + PROBE_TIMEOUT_MS;
    return this.#probeId;
  }

  // Sin número: el request no era una prueba. Uno viejo: una prueba que ya venció.
  #isCurrentProbe(probeId: number | undefined): boolean {
    return probeId !== undefined && this.#probing && probeId === this.#probeId;
  }

  #closeIfCurrentProbe(probeId: number | undefined): void {
    if (!this.#isCurrentProbe(probeId)) return;
    this.#openUntilMs = 0;
    this.#logger.info('rate limit store recovered: counting in Valkey again');
  }

  #open(error: unknown): void {
    this.#openUntilMs = this.#now() + OPEN_MS;
    if (this.#now() < this.#nextFailureLogAtMs) return;
    this.#nextFailureLogAtMs = this.#now() + FAILURE_LOG_INTERVAL_MS;
    this.#logger.error({ err: error }, 'rate limit store failed: counting in memory per instance');
  }
}
