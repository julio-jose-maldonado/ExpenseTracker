import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Con el principal caído fallan todos los requests: un aviso cada tanto alcanza.
const FAILURE_LOG_INTERVAL_MS = 30_000;

export interface FallbackRateLimitStoreDependencies {
  primary: IRateLimitStore;
  fallback: IRateLimitStore;
  logger: Logger;
  now?: () => number;
}

// Cuenta en el principal (Valkey, compartido entre instancias) y, si falla, en el respaldo (memoria
// del proceso). Con el respaldo cada instancia cuenta por su lado: el límite queda más flojo
// (multiplicado por la cantidad de instancias), pero la API no se queda sin límite.
export class FallbackRateLimitStore implements IRateLimitStore {
  readonly #primary: IRateLimitStore;
  readonly #fallback: IRateLimitStore;
  readonly #logger: Logger;
  readonly #now: () => number;
  #nextFailureLogAtMs = 0;

  constructor({ primary, fallback, logger, now = Date.now }: FallbackRateLimitStoreDependencies) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.#logger = logger;
    this.#now = now;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    try {
      return await this.#primary.increment(key, ttlSeconds);
    } catch (error) {
      if (this.#now() >= this.#nextFailureLogAtMs) {
        this.#nextFailureLogAtMs = this.#now() + FAILURE_LOG_INTERVAL_MS;
        this.#logger.error({ err: error }, 'rate limit store failed: counting in memory per instance');
      }
      return this.#fallback.increment(key, ttlSeconds);
    }
  }
}
