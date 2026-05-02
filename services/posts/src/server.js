import { createApp } from './app.js';
import { getPool, closeMySQL } from './db/mysql.js';
import { logger } from './util/logger.js';

const PORT = Number(process.env.PORT || 8008);

async function main() {
  getPool();
  const app = createApp();
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'posts service listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutdown requested');
    server.close(async () => {
      await closeMySQL();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'fatal startup error');
  process.exit(1);
});

