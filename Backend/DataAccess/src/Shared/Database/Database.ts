import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Token de DI y tipo de la conexión Drizzle. Solo se inyecta en 4.Repositories.
export type Database = NodePgDatabase;
export const Database = 'Database';
