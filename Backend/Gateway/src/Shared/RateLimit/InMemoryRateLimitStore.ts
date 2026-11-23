import type { Logger } from '@expense-tracker/core';
import type { IRateLimitStore } from './IRateLimitStore';

// Tope por defecto: alcanza para el tráfico normal de una ventana y acota la memoria (unos pocos MB)
// si un ataque desde muchas IPs crea una clave por cada una.
const DEFAULT_MAX_KEYS = 100_000;

// Con el tope lleno puede pasar en cada request: un aviso cada tanto alcanza.
const FULL_LOG_INTERVAL_MS = 30_000;

// Cada cuánto se recorre el mapa para descartar claves vencidas: en cada request sería O(n).
const PURGE_INTERVAL_MS = 1_000;
// Con el tope lleno se limpia más seguido, para liberar lugar antes de dejar pasar claves nuevas sin
// contar. Tiene su propio tope: en un ataque las claves vencen de a una por milisegundo, y recorrer el
// mapa cada vez que vence una trababa al Gateway. Así son a lo sumo 10 pasadas por segundo.
const FORCED_PURGE_INTERVAL_MS = 100;

interface Entry {
  count: number;
  expiresAtMs: number;
}

// Contador en la memoria del proceso. Es el valor por defecto de la App cuando no se le pasa otro
// (tests) y el respaldo cuando Valkey falla: cada instancia del Gateway cuenta por separado, por eso
// en producción el principal es Valkey.
// Con el tope lleno, una clave nueva pasa sin contarse (devuelve 0) y los conteos vigentes se
// conservan. Descartar un conteo vigente le reiniciaría el límite a quien ya lo pasó, y hacer que las
// claves nuevas compartan un contador dejaría a toda la instancia en 429. Es un modo degradado: un
// solo atacante con muchos bloques IPv6 puede llenar el tope, y contra eso protege el WAF (ver
// Decisiones_Tecnicas).
export class InMemoryRateLimitStore implements IRateLimitStore {
  readonly #entries = new Map<string, Entry>();
  #lastPurgeAtMs = Number.NEGATIVE_INFINITY;
  #nextFullLogAtMs = 0;

  constructor(
    // Por defecto, un reloj monotónico: mide plazos y no salta si se ajusta la hora del sistema (NTP).
    private readonly now: () => number = () => performance.now(),
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
    private readonly logger?: Logger,
  ) {}

  get size(): number {
    return this.#entries.size;
  }

  increment(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = this.now();
    this.#purgeExpired(nowMs, PURGE_INTERVAL_MS);
    const current = this.#entries.get(key);
    if (!current && this.#entries.size >= this.maxKeys) {
      this.#purgeExpired(nowMs, FORCED_PURGE_INTERVAL_MS);
      if (this.#entries.size >= this.maxKeys) {
        this.#logFull(nowMs);
        return Promise.resolve(0);
      }
    }
    const entry = current && current.expiresAtMs > nowMs ? current : { count: 0, expiresAtMs: nowMs + ttlSeconds * 1000 };
    entry.count += 1;
    this.#entries.set(key, entry);
    return Promise.resolve(entry.count);
  }

  #logFull(nowMs: number): void {
    if (nowMs < this.#nextFullLogAtMs) return;
    this.#nextFullLogAtMs = nowMs + FULL_LOG_INTERVAL_MS;
    this.logger?.warn({ maxKeys: this.maxKeys }, 'rate limit memory store full: new keys are not being limited');
  }

  // Recorre el mapa solo si pasaron intervalMs desde la última pasada.
  #purgeExpired(nowMs: number, intervalMs: number): void {
    if (nowMs - this.#lastPurgeAtMs < intervalMs) return;
    this.#lastPurgeAtMs = nowMs;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtMs <= nowMs) this.#entries.delete(key);
    }
  }
}
