import 'reflect-metadata';
import { createLogger } from '@expense-tracker/core';
import { App } from './App';
import { loadEnvConfigs } from './Config/EnvConfigs';
import { disposeContainerList, registerContainerList } from './Domains/RegisterContainerList';

const logger = createLogger('gateway');

function main(): void {
  const config = loadEnvConfigs();
  registerContainerList({ businessGrpcAddress: config.businessGrpcAddress });
  // En Express 5 el callback de listen también corre si falla, con el error como argumento.
  const httpServer = new App(logger, { trustedProxyHops: config.trustedProxyHops }).server.listen(config.port, (error?: Error) => {
    if (!error) logger.info({ port: config.port }, 'gateway listening');
  });
  // Los errores de listen (puerto ocupado, sin permisos) llegan como evento, no como excepción.
  httpServer.on('error', (error) => {
    logger.fatal({ err: error }, 'gateway failed to start');
    process.exit(1);
  });

  const shutdown = () =>
    httpServer.close(() => {
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
try {
  main();
} catch (error) {
  logger.fatal({ err: error }, 'gateway failed to start');
  process.exit(1);
}
