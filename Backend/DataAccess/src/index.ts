import 'reflect-metadata';
import { createLogger, startGrpcServer } from '@expense-tracker/core';
import { loadEnvConfigs } from './Config/EnvConfigs';
import { createGrpcServer } from './CreateGrpcServer';
import { registerContainerList } from './Domains/RegisterContainerList';
import { createDatabase } from './Shared/Database/CreateDatabase';

const logger = createLogger('data-access');

async function main(): Promise<void> {
  const config = loadEnvConfigs();
  const { db, pool } = createDatabase(config.database, logger);
  registerContainerList({ db });
  const server = createGrpcServer(logger);
  const port = await startGrpcServer(server, config.grpcPort);
  logger.info({ port }, 'data-access gRPC server listening');

  const shutdown = () => server.tryShutdown(() => void pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Estado desconocido: mejor morir y que el orquestador (ECS) levante otra instancia.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  process.exit(1);
});
main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'data-access failed to start');
  process.exit(1);
});
