import type { IRateLimitStore } from './IRateLimitStore';

// Contador en la memoria del proceso. Es el valor por defecto de la App cuando no se le pasa otro
// (tests): cada instancia del Gateway contaría por separado, por eso en producción se usa Valkey.
export class InMemoryRateLimitStore implements IRateLimitStore {
  readonly #entries = new Map<string, { count: number; expiresAtMs: number }>();
  #nextPurgeAtMs = 0;

  constructor(private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.#entries.size;
  }

  increment(key: string, ttlSeconds: number): Promise<number> {
    const nowMs = this.now();
    this.#purgeExpired(nowMs);
    const current = this.#entries.get(key);
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
