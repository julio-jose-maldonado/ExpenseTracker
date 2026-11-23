import type { Redis } from 'iovalkey';
import type { IRateLimitStore } from './IRateLimitStore';

// Sumar y poner el vencimiento en un solo paso atómico: con dos comandos separados, si el proceso
// muere entre uno y otro la clave queda sin vencimiento.
const INCREMENT_WITH_EXPIRY = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const COMMAND_NAME = 'incrementWithExpiry';

type ClientWithCommand = Redis & { [COMMAND_NAME](key: string, ttlSeconds: number): Promise<number> };

export class ValkeyRateLimitStore implements IRateLimitStore {
  readonly #client: ClientWithCommand;

  constructor(client: Redis) {
    // Registrado como comando, el cliente manda solo el hash del script (EVALSHA) y no el texto
    // entero en cada request; si Valkey todavía no lo tiene, lo vuelve a mandar completo.
    client.defineCommand(COMMAND_NAME, { numberOfKeys: 1, lua: INCREMENT_WITH_EXPIRY });
    this.#client = client as ClientWithCommand;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    return Number(await this.#client[COMMAND_NAME](key, ttlSeconds));
  }
}
