import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Con el principal caído fallan todos los requests: un aviso cada tanto alcanza.
const FAILURE_LOG_INTERVAL_MS = 30_000;

// Después de un fallo, cuánto tiempo se cuenta directo en memoria sin consultar al principal. Con
// Valkey colgado cada consulta espera el timeout del cliente (250 ms): así lo espera una sola por corte.
const OPEN_MS = 5_000;

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
// si falla se corta otra vez. Mientras dura el corte tampoco hay doble conteo (Valkey + memoria).
export class FallbackRateLimitStore implements IRateLimitStore {
  readonly #primary: IRateLimitStore;
  readonly #fallback: IRateLimitStore;
  readonly #logger: Logger;
  readonly #now: () => number;
  #nextFailureLogAtMs = 0;
  // 0: cerrado (se consulta al principal). Otro valor: hasta cuándo dura el corte.
  #openUntilMs = 0;
  #probing = false;

  constructor({ primary, fallback, logger, now = Date.now }: FallbackRateLimitStoreDependencies) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#logger = logger;
    this.#now = now;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    if (this.#probing || this.#now() < this.#openUntilMs) return this.#fallback.increment(key, ttlSeconds);

    const isProbe = this.#openUntilMs !== 0;
    if (isProbe) this.#probing = true;
    try {
      const count = await this.#primary.increment(key, ttlSeconds);
      this.#openUntilMs = 0;
      return count;
    } catch (error) {
      this.#openUntilMs = this.#now() + OPEN_MS;
      if (this.#now() >= this.#nextFailureLogAtMs) {
        this.#nextFailureLogAtMs = this.#now() + FAILURE_LOG_INTERVAL_MS;
        this.#logger.error({ err: error }, 'rate limit store failed: counting in memory per instance');
      }
      return this.#fallback.increment(key, ttlSeconds);
    } finally {
      if (isProbe) this.#probing = false;
    }
  }
}
