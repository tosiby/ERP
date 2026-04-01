// =============================================================
// KJSIS — Server Entry Point (Phase 2: + job scheduler)
// =============================================================

import 'dotenv/config';
import app from './app';
import { checkDbConnection } from './utils/db';
import { logger } from './utils/logger';
import { startScheduler } from './jobs/scheduler';

const PORT = parseInt(process.env.PORT ?? '4000');

const startServer = async (): Promise<void> => {
  const dbOk = await checkDbConnection();
  if (!dbOk) {
    logger.error('Cannot connect to database. Shutting down.');
    process.exit(1);
  }
  logger.info('Database connection established');

  const server = app.listen(PORT, () => {
    logger.info(`KJSIS Backend v2.0 running on port ${PORT} [${process.env.NODE_ENV}]`);
  });

  // Start background jobs
  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason });
    process.exit(1);
  });
};

startServer();
