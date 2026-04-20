import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './util/logger.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { getPool, closeMySQL } from './db/mysql.js';
import { getRedis, closeRedis } from './db/redis.js';
import { startKafkaConsumer, stopKafkaConsumer } from './kafka/consumer.js';
import { setMetricSink as setCacheMetricSink, closeCache } from '../../shared/cache.js';

async function main() {
  // Fail fast if the DB layer can't come up. Redis and Kafka are allowed to
  // lag or come up after the service — graceful degradation for those.
  getPool();
  await connectMongo();

  if (config.REDIS_ENABLED) {
    getRedis();
  }

  // Route cache metrics into pino so we can later ship them to the
  // cache_metrics collection during Phase 5 charting. Kept at debug so prod
  // log volume stays low unless we opt in.
  setCacheMetricSink((m) => logger.debug(m, 'cache_metric'));

  // Kafka consumer is fire-and-forget — we don't block startup on it so that
  // the HTTP server is reachable for /health probes even if Kafka is slow
  // to come up in docker-compose.
  if (config.KAFKA_ENABLED) {
    startKafkaConsumer().catch((err) => {
      logger.error({ err: err.message }, 'kafka consumer failed to start');
    });
  }

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, service: config.SERVICE_NAME, env: config.NODE_ENV },
      'analytics service listening',
    );
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutdown requested');
    server.close(async () => {
      await stopKafkaConsumer();
      await closeRedis();
      await closeCache();
      await closeMongo();
      await closeMySQL();
      logger.info('shutdown complete');
      process.exit(0);
    });
    // Hard-kill fallback if graceful shutdown hangs
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
