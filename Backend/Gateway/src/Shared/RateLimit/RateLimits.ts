import type { Endpoint } from './Endpoints';

export interface RateLimit {
  max: number;
  windowSeconds: number;
}

// Los límites de un request. Hoy solo por IP; otras dimensiones (por usuario, global del endpoint)
// se agregan acá como propiedades nuevas, sin cambiar las reglas que ya existen.
export interface RateLimitPolicy {
  perIp: RateLimit;
}

export interface RateLimitTable {
  // Vale para todo endpoint sin regla propia. Las rutas que no existen comparten una sola cuenta.
  general: RateLimitPolicy;
  // Regla propia de un endpoint (`MÉTODO ruta`, como se registró en el controller): reemplaza a la general.
  overrides: Readonly<Record<string, RateLimitPolicy>>;
  // Endpoints sin límite.
  exempt: readonly string[];
}

// Todos los límites del Gateway. Cada endpoint lleva su propia cuenta por cliente.
export const RATE_LIMITS: RateLimitTable = {
  // `max` se puede cambiar por variable de entorno (RATE_LIMIT_GENERAL_MAX).
  general: { perIp: { max: 10, windowSeconds: 1 } },
  overrides: {},
  // Lo consulta el balanceador para saber si la instancia está viva.
  exempt: ['GET /isAlive'],
};

export function withGeneralMax(table: RateLimitTable, max: number | undefined): RateLimitTable {
  if (max === undefined) return table;
  return { ...table, general: { ...table.general, perIp: { ...table.general.perIp, max } } };
}

// Una regla con la ruta mal escrita no se aplicaría nunca y nadie se enteraría: mejor no arrancar.
export function assertRulesMatchEndpoints(table: RateLimitTable, endpoints: Endpoint[]): void {
  const known = new Set(endpoints.map((endpoint) => endpoint.id));
  const unknown = [...Object.keys(table.overrides), ...table.exempt].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Rate limit: hay reglas para rutas que no existen: ${unknown.join(', ')}`);
  }
}
