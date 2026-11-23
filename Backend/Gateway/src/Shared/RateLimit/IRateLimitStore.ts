// Contador con vencimiento. Suma uno a la clave y devuelve el total; la clave se borra sola
// `ttlSeconds` después de crearse.
export interface IRateLimitStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
}
