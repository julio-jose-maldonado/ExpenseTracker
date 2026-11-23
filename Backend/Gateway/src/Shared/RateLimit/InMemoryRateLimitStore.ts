import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Tope por defecto: alcanza para el tráfico normal de una ventana y acota la memoria (unos pocos MB)
// si un ataque desde muchas IPs crea una clave por cada una.
const DEFAULT_MAX_KEYS = 100_000;

// Con el tope lleno puede pasar en cada request: un aviso cada tanto alcanza.
const FULL_LOG_INTERVAL_MS = 30_000;

interface Entry {
  count: number;
  expiresAtMs: number;
}

// Contador en la memoria del proceso. Es el valor por defecto de la App cuando no se le pasa otro
// (tests) y el respaldo cuando Valkey falla: cada instancia del Gateway cuenta por separado, por eso
// en producción el principal es Valkey.
// Con el tope lleno, una clave nueva pasa sin contarse (devuelve 0) y los conteos vigentes se
// conservan. Descartar un conteo vigente le reiniciaría el límite a quien ya lo pasó, y hacer que las
// claves nuevas compartan un contador dejaría a toda la instancia en 429. Llenar el tope exige más de
// maxKeys clientes distintos en una misma ventana, y contra eso el límite por IP no sirve igual.
export class InMemoryRateLimitStore implements IRateLimitStore {
  readonly #entries = new Map<string, Entry>();
  #nextPurgeAtMs = 0;
  // Cota inferior del vencimiento más próximo: si todavía no llegó, no hay nada vencido y la limpieza
  // forzada no recorre el mapa. Sin esto, con el tope lleno cada request con clave nueva recorría todo.
  #earliestExpiryMs = Number.POSITIVE_INFINITY;
  #nextFullLogAtMs = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
    private readonly logger?: Logger,
  ) {}

  get size(): number {
    return this.#entries.size;
  }

  increment(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = this.now();
    this.#purgeExpired(nowMs);
    const current = this.#entries.get(key);
    if (!current && this.#entries.size >= this.maxKeys) {
      // La limpieza periódica corre a lo sumo una vez por segundo: puede haber claves vencidas ocupando lugar.
      if (nowMs >= this.#earliestExpiryMs) this.#purgeExpired(nowMs, true);
      if (this.#entries.size >= this.maxKeys) {
        this.#logFull(nowMs);
        return Promise.resolve(0);
      }
    }
    const entry = current && current.expiresAtMs > nowMs ? current : { count: 0, expiresAtMs: nowMs + ttlSeconds * 1000 };
    entry.count += 1;
    this.#entries.set(key, entry);
    this.#earliestExpiryMs = Math.min(this.#earliestExpiryMs, entry.expiresAtMs);
    return Promise.resolve(entry.count);
  }

  #logFull(nowMs: number): void {
    if (nowMs < this.#nextFullLogAtMs) return;
    this.#nextFullLogAtMs = nowMs + FULL_LOG_INTERVAL_MS;
    this.logger?.warn({ maxKeys: this.maxKeys }, 'rate limit memory store full: new keys are not being limited');
  }

  // A lo sumo una pasada por segundo, para no recorrer todo el mapa en cada request.
  #purgeExpired(nowMs: number, force = false): void {
    if (!force && nowMs < this.#nextPurgeAtMs) return;
    this.#nextPurgeAtMs = nowMs + 1000;
    let earliest = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtMs <= nowMs) this.#entries.delete(key);
      else earliest = Math.min(earliest, entry.expiresAtMs);
    }
    this.#earliestExpiryMs = earliest;
  }
}
