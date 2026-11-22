import 'reflect-metadata';
import { createLogger } from '@expense-tracker/core';
import { App } from './App';
import { loadEnvConfigs } from './Config/EnvConfigs';
import { disposeContainerList, registerContainerList } from './Domains/RegisterContainerList';
import { FallbackRateLimitStore } from './Shared/RateLimit/FallbackRateLimitStore';
import { InMemoryRateLimitStore } from './Shared/RateLimit/InMemoryRateLimitStore';
import { RATE_LIMITS, withGeneralMax } from './Shared/RateLimit/RateLimits';
import { ValkeyRateLimitStore } from './Shared/RateLimit/ValkeyRateLimitStore';
import { createValkeyClient } from './Shared/Valkey/CreateValkeyClient';

const logger = createLogger('gateway');

function main(): void {
  const config = loadEnvConfigs();
  registerContainerList({ businessGrpcAddress: config.businessGrpcAddress });
  // No espera la conexión: si Valkey está caído, el Gateway arranca igual y cuenta en memoria por instancia.
  const valkey = createValkeyClient(config.valkeyUrl, logger);
  const store = new FallbackRateLimitStore({ primary: new ValkeyRateLimitStore(valkey), fallback: new InMemoryRateLimitStore(Date.now, undefined, logger), logger });
  const app = new App(logger, {
    trustedProxyHops: config.trustedProxyHops,
    rateLimit: { table: withGeneralMax(RATE_LIMITS, config.rateLimitGeneralMax), store },
  });
  // En Express 5 el callback de listen también corre si falla, con el error como argumento.
  const httpServer = app.server.listen(config.port, (error?: Error) => {
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
      valkey.disconnect();
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
