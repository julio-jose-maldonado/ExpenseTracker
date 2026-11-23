import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Con el principal caído fallan todos los requests: un aviso cada tanto alcanza.
const FAILURE_LOG_INTERVAL_MS = 30_000;

// Después de un fallo, cuánto tiempo se cuenta directo en memoria sin consultar al principal. Con
// Valkey colgado cada consulta espera el timeout del cliente (250 ms): así lo espera una sola por corte.
const OPEN_MS = 5_000;

// Tope propio de cada consulta al principal, por encima del timeout del cliente de Valkey (250 ms):
// si una consulta no termina nunca, el request no puede quedar colgado ni el corte sin abrirse.
const PRIMARY_TIMEOUT_MS = 1_000;

export interface FallbackRateLimitStoreDependencies {
  primary: IRateLimitStore;
  fallback: IRateLimitStore;
  logger: Logger;
  now?: () => number;
}

// Cuenta en el principal (Valkey, compartido entre instancias) y, si falla, en el respaldo (memoria
// del proceso). El respaldo es un modo degradado: cada instancia cuenta por su lado (el límite se
// multiplica por la cantidad de instancias) y no protege contra un ataque distribuido (eso va en el
// WAF, ver Decisiones_Tecnicas). Sirve para que la API no se quede sin límite si Valkey falla.
// Corte automático: tras un fallo (error o más de PRIMARY_TIMEOUT_MS sin respuesta), durante OPEN_MS
// todo va al respaldo. Vencido ese tiempo, un solo request prueba al principal mientras los demás
// siguen en memoria; si responde se vuelve a Valkey, si falla se corta otra vez. Solo la prueba
// cierra el corte: la respuesta tardía de un request que salió antes de abrirlo no cuenta.
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
      const count = await withTimeout(this.#primary.increment(key, ttlSeconds), PRIMARY_TIMEOUT_MS);
      if (isProbe) this.#close();
      return count;
    } catch (error) {
      this.#open(error);
      return this.#fallback.increment(key, ttlSeconds);
    } finally {
      if (isProbe) this.#probing = false;
    }
  }

  #close(): void {
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

// La consulta que no termina a tiempo se abandona: si responde después, nadie usa su resultado.
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`rate limit store timed out after ${ms} ms`)), ms);
    // Un timer pendiente no tiene que impedir que el proceso termine (apagado, tests).
    timer.unref();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
