import type { Logger } from '@expense-tracker/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Database } from './Database';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function createDatabase(config: DatabaseConfig, logger: Logger): { db: Database; pool: Pool } {
  const pool = new Pool({
    ...config,
    max: 10,
    // Menor que el deadline de 3 s de callUnary: si la base no responde, el error llega antes que el timeout.
    connectionTimeoutMillis: 2_000,
    // Una query trabada no puede retener la conexión después de que el caller gRPC se rindió:
    // Postgres la cancela (statement_timeout) y, si ni eso responde, el cliente corta (query_timeout).
    statement_timeout: 2_000,
    query_timeout: 2_500,
    idleTimeoutMillis: 30_000,
  });
  // Sin este listener, un error en una conexión ociosa (base reiniciada, red) tira el proceso.
  pool.on('error', (error) => logger.error({ err: error }, 'postgres idle client error'));
  return { pool, db: drizzle({ client: pool }) };
}
