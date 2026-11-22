import type { IRateLimitStore } from './IRateLimitStore';

// Tope por defecto: alcanza para el tráfico normal de una ventana y acota la memoria (unos pocos MB)
// si un ataque desde muchas IPs crea una clave por cada una. Con el tope lleno no se descarta ningún
// conteo vigente (eso le reiniciaría el límite a quien ya lo pasó): las claves nuevas comparten un
// contador de desborde, así que esos clientes llegan antes al límite hasta que venzan claves.
const DEFAULT_MAX_KEYS = 100_000;

interface Entry {
  count: number;
  expiresAtMs: number;
}

// Contador en la memoria del proceso. Es el valor por defecto de la App cuando no se le pasa otro
// (tests) y el respaldo cuando Valkey falla: cada instancia del Gateway cuenta por separado, por eso
// en producción el principal es Valkey.
export class InMemoryRateLimitStore implements IRateLimitStore {
  readonly #entries = new Map<string, Entry>();
  // Con el tope lleno, las claves nuevas cuentan acá todas juntas (fuera del mapa).
  #overflow: Entry = { count: 0, expiresAtMs: 0 };
  #nextPurgeAtMs = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  get size(): number {
    return this.#entries.size;
  }

  increment(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = this.now();
    this.#purgeExpired(nowMs);
    const current = this.#entries.get(key);
    if (!current && this.#entries.size >= this.maxKeys) {
      if (this.#overflow.expiresAtMs <= nowMs) this.#overflow = { count: 0, expiresAtMs: nowMs + ttlSeconds * 1000 };
      this.#overflow.count += 1;
      return Promise.resolve(this.#overflow.count);
    }
    const entry = current && current.expiresAtMs > nowMs ? current : { count: 0, expiresAtMs: nowMs + ttlSeconds * 1000 };
    entry.count += 1;
    this.#entries.set(key, entry);
    return Promise.resolve(entry.count);
  }

  // A lo sumo una pasada por segundo, para no recorrer todo el mapa en cada request.
  #purgeExpired(nowMs: number): void {
    if (nowMs < this.#nextPurgeAtMs) return;
    this.#nextPurgeAtMs = nowMs + 1000;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtMs <= nowMs) this.#entries.delete(key);
    }
  }
}
