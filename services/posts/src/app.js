import express from 'express';
import cors from 'cors';

import { healthRouter } from './routes/health.js';
import { postsRouter } from './routes/posts.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  app.use(healthRouter);
  app.use(postsRouter);
  return app;
}

