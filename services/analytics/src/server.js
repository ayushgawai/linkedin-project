import express from 'express';
import cors from 'cors';
import { errorResponse } from '../../shared/response.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  // Analytics uses MongoDB — wire db check when MongoDB client is added
  res.json({ status: 'ok', service: 'analytics', db: 'disconnected', kafka: 'disconnected' });
});

app.use((_req, res) => {
  res.status(501).json(errorResponse('NOT_IMPLEMENTED', 'analytics service route not implemented yet'));
});

const port = Number(process.env.PORT || 8006);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'analytics', port, status: 'started' }));
});
