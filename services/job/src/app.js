import express from 'express';
import { traceMiddleware } from './middleware/trace.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';
import { jobsRouter } from './routes/jobs.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(traceMiddleware);
  app.use(healthRouter);
  app.use(jobsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
