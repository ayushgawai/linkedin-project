import { Router } from 'express';
import { ok } from '../util/envelope.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.json(ok({ status: 'ok', service: process.env.SERVICE_NAME || 'posts' }, req.traceId));
});

