import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './util/logger.js';
import { getPool, closeMySQL } from './db/mysql.js';
import { setMetricSink, closeCache } from '../../shared/cache.js';

async function main() {
  getPool();
  setMetricSink((m) => logger.debug(m, 'cache_metric'));

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, service: config.SERVICE_NAME, env: config.NODE_ENV },
      'profile service listening',
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutdown requested');
    server.close(async () => {
      await closeCache();
      await closeMySQL();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('shutdown timed out — force-exiting');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message, stack: err.stack }, 'uncaughtException');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason: String(reason) }, 'unhandledRejection');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'fatal startup error');
  process.exit(1);
});
