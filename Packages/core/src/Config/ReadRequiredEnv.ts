// Lee variables de entorno obligatorias y falla al arrancar si falta alguna (fail fast).
export function readRequiredEnv<const K extends string>(names: readonly K[]): Record<K, string> {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name] as string])) as Record<K, string>;
}
