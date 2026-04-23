import { Router } from 'express';
import { pingMySQL } from '../db/mysql.js';
import { pingMongo } from '../db/mongo.js';
import { pingRedis } from '../db/redis.js';
import { isKafkaHealthy } from '../kafka/consumer.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  const [mysqlOk, mongoOk, redisOk] = await Promise.all([
    pingMySQL(),
    pingMongo(),
    pingRedis(),
  ]);
  const kafkaOk = isKafkaHealthy();

  const allRequired = mysqlOk && mongoOk && (!config.KAFKA_ENABLED || kafkaOk);

  res.status(allRequired ? 200 : 503).json({
    status: allRequired ? 'ok' : 'degraded',
    service: config.SERVICE_NAME,
    db: mysqlOk ? 'connected' : 'disconnected',
    mongo: mongoOk ? 'connected' : 'disconnected',
    redis: config.REDIS_ENABLED ? (redisOk ? 'connected' : 'disconnected') : 'disabled',
    kafka: config.KAFKA_ENABLED ? (kafkaOk ? 'connected' : 'disconnected') : 'disabled',
    trace_id: req.traceId,
  });
});
