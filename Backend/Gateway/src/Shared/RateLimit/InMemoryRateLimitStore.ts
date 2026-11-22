import type { IRateLimitStore } from './IRateLimitStore';

// Tope por defecto: alcanza para el tráfico normal de una ventana y acota la memoria (unos pocos MB)
// si un ataque desde muchas IPs crea una clave por cada una.
const DEFAULT_MAX_KEYS = 100_000;

// Contador en la memoria del proceso. Es el valor por defecto de la App cuando no se le pasa otro
// (tests) y el respaldo cuando Valkey falla: cada instancia del Gateway cuenta por separado, por eso
// en producción el principal es Valkey.
export class InMemoryRateLimitStore implements IRateLimitStore {
  readonly #entries = new Map<string, { count: number; expiresAtMs: number }>();
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
    if (!current) this.#makeRoom();
    const entry = current && current.expiresAtMs > nowMs ? current : { count: 0, expiresAtMs: nowMs + ttlSeconds * 1000 };
    entry.count += 1;
    this.#entries.set(key, entry);
    return Promise.resolve(entry.count);
  }

  // Con el tope lleno, saca la clave más vieja: el Map guarda el orden de inserción y una clave que
  // ya existe no cambia de lugar al actualizarse.
  #makeRoom(): void {
    if (this.#entries.size < this.maxKeys) return;
    const oldest = this.#entries.keys().next();
    if (!oldest.done) this.#entries.delete(oldest.value);
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
