import { Router } from 'express';
import { pingMySQL } from '../db/mysql.js';
import { isHealthy as isRedisHealthy } from '../../../shared/cache.js';
import { config } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  const mysqlOk = await pingMySQL();
  const redisOk = isRedisHealthy();
  const allOk = mysqlOk;
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: config.SERVICE_NAME,
    db: mysqlOk ? 'connected' : 'disconnected',
    redis: config.REDIS_ENABLED ? (redisOk ? 'connected' : 'disconnected') : 'disabled',
    trace_id: req.traceId,
  });
});
