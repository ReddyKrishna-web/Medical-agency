import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initSocketServer, closeSocketServer } from './sockets';
import { logger } from './utils/logger';
import { startScheduler, stopScheduler } from './jobs/scheduler';

const bootstrap = async (): Promise<void> => {
  logger.info('Starting Supply Medicals API', {
    environment: env.NODE_ENV,
    port: env.PORT,
    service: env.serviceName
  });

  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initSocketServer(server);
  startScheduler();

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info(`API listening on ${env.SERVER_URL} (api root: /api)`);
      resolve();
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}; shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    stopScheduler();
    await closeSocketServer();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await disconnectDatabase();

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception; exiting', { error });
    void shutdown('uncaughtException');
  });
};

bootstrap().catch((error: unknown) => {
  logger.error('Fatal startup error', { error });
  process.exit(1);
});
