import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

let client = null;
let redisHealthy = false;

export function getRedis() {
  if (!config.REDIS_ENABLED) return null;
  if (client) return client;
  client = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    reconnectOnError: () => true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('ready', () => {
    redisHealthy = true;
    logger.info({ host: config.REDIS_HOST }, 'redis ready');
  });
  client.on('error', (err) => {
    redisHealthy = false;
    logger.warn({ err: err.message }, 'redis error');
  });
  client.on('end', () => {
    redisHealthy = false;
    logger.warn('redis connection ended');
  });

  return client;
}

export function isRedisHealthy() {
  return config.REDIS_ENABLED && redisHealthy;
}

export async function pingRedis() {
  if (!config.REDIS_ENABLED) return false;
  try {
    const r = getRedis();
    if (!r) return false;
    const pong = await r.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
    redisHealthy = false;
  }
}
