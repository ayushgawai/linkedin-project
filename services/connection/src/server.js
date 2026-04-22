import express from 'express';
import cors from 'cors';
import { pingDb } from '../../shared/db.js';
import { errorResponse } from '../../shared/response.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try {
    if (await pingDb()) dbState = 'connected';
  } catch { /* leave disconnected */ }
  res.json({ status: 'ok', service: 'connection', db: dbState, kafka: 'disconnected' });
});

app.use((_req, res) => {
  res.status(501).json(errorResponse('NOT_IMPLEMENTED', 'connection service route not implemented yet'));
});

const port = Number(process.env.PORT || 8005);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'connection', port, status: 'started' }));
});
