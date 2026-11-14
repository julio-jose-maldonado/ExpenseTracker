import 'reflect-metadata';
import { createLogger, startGrpcServer } from '@expense-tracker/core';
import { loadEnvConfigs } from './Config/EnvConfigs';
import { createGrpcServer } from './CreateGrpcServer';
import { disposeContainerList, registerContainerList } from './Domains/RegisterContainerList';

const logger = createLogger('business');

async function main(): Promise<void> {
  const config = loadEnvConfigs();
  registerContainerList({ dataAccessGrpcAddress: config.dataAccessGrpcAddress });
  const server = createGrpcServer(logger);
  const port = await startGrpcServer(server, config.grpcPort);
  logger.info({ port }, 'business gRPC server listening');

  const shutdown = () =>
    server.tryShutdown(() => {
      disposeContainerList();
      process.exit(0);
    });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Estado desconocido: mejor morir y que el orquestador (ECS) levante otra instancia.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  process.exit(1);
});
main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'business failed to start');
  process.exit(1);
});
