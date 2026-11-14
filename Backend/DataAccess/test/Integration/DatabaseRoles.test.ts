import { readRequiredEnv } from '@expense-tracker/core';
import { createSilentLogger } from '@expense-tracker/testing';
import type { Pool } from 'pg';
import { checkDatabaseHealth } from '../../src/Domains/Health/5.ExternalServices/CheckDatabaseHealth';
import { createDatabase } from '../../src/Shared/Database/CreateDatabase';

// Contra el Postgres de docker compose, con los roles que crea Database/Init.
const env = readRequiredEnv([
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'MIGRATOR_DATABASE_USER',
  'MIGRATOR_DATABASE_PASSWORD',
]);
const base = { host: env.DATABASE_HOST, port: Number(env.DATABASE_PORT), database: env.DATABASE_NAME };
const logger = createSilentLogger('data-access');

const INSUFFICIENT_PRIVILEGE = '42501';

describe('Roles de Postgres', () => {
  const app = createDatabase({ ...base, user: env.DATABASE_USER, password: env.DATABASE_PASSWORD }, logger);
  const migrator = createDatabase(
    { ...base, user: env.MIGRATOR_DATABASE_USER, password: env.MIGRATOR_DATABASE_PASSWORD },
    logger,
  );
  const probeTable = `integration_probe_${process.pid}`;

  afterAll(async () => {
    await Promise.all([app.pool, migrator.pool].map((pool: Pool) => pool.end()));
  });

  it('el health check responde con el rol de la app', async () => {
    await expect(checkDatabaseHealth(app.db)).resolves.toBe(true);
  });

  it('el rol de la app no puede crear tablas', async () => {
    await expect(app.pool.query(`create table ${probeTable} (id int)`)).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
    });
  });

  it('lo que crea el migrator queda con DML para la app, pero no puede borrarlo', async () => {
    await migrator.pool.query(`create table ${probeTable} (id serial primary key, name text)`);
    try {
      await app.pool.query(`insert into ${probeTable} (name) values ('a')`);
      await app.pool.query(`update ${probeTable} set name = 'b'`);
      const { rows } = await app.pool.query(`select name from ${probeTable}`);
      await app.pool.query(`delete from ${probeTable}`);

      expect(rows).toEqual([{ name: 'b' }]);
      await expect(app.pool.query(`drop table ${probeTable}`)).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
    } finally {
      await migrator.pool.query(`drop table if exists ${probeTable}`);
    }
  });
});
