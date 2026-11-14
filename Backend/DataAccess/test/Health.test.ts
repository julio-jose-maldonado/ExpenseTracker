import 'reflect-metadata';
import { credentials, type ServiceError, status, type Server } from '@grpc/grpc-js';
import { startGrpcServer } from '@expense-tracker/core';
import { createSilentLogger } from '@expense-tracker/testing';
import { healthV1 } from '@expense-tracker/proto';
import type { Pool } from 'pg';
import { container } from 'tsyringe';
import { createGrpcServer } from '../src/CreateGrpcServer';
import { ICheckDatabaseHealth } from '../src/Domains/Health/4.Repositories/CheckDatabaseHealth/ICheckDatabaseHealth';
import { registerContainerList } from '../src/Domains/RegisterContainerList';
import { createDatabase } from '../src/Shared/Database/CreateDatabase';

const silentLogger = createSilentLogger('data-access');

// Base inalcanzable: el puerto 1 rechaza la conexión al instante.
const UNREACHABLE_DATABASE = { host: '127.0.0.1', port: 1, database: 'x', user: 'x', password: 'x' };

describe('DataAccess HealthService', () => {
  let server: Server;
  let client: healthV1.HealthServiceClient;
  let pool: Pool;

  const check = () =>
    new Promise<healthV1.CheckResponse>((resolve, reject) =>
      client.check({}, (error, res) => (error ? reject(error) : resolve(res))),
    );

  beforeEach(async () => {
    container.reset();
    const database = createDatabase(UNREACHABLE_DATABASE, silentLogger);
    pool = database.pool;
    registerContainerList({ db: database.db });
    server = createGrpcServer(silentLogger);
    const port = await startGrpcServer(server, 0);
    client = new healthV1.HealthServiceClient(`127.0.0.1:${port}`, credentials.createInsecure());
  });

  afterEach(async () => {
    client.close();
    server.forceShutdown();
    await pool.end();
  });

  it('responde ok cuando la base responde', async () => {
    container.register(ICheckDatabaseHealth, { useValue: { check: async () => true } });

    await expect(check()).resolves.toEqual({ ok: true });
  });

  it('responde UNAVAILABLE cuando la base no responde', async () => {
    const error = (await check().catch((e: unknown) => e)) as ServiceError;

    expect(error.code).toBe(status.UNAVAILABLE);
    expect(error.details).toBe('SERVICE_UNAVAILABLE');
  });
});
