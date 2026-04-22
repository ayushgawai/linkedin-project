import express from 'express';
import cors from 'cors';
import { pingDb } from '../../shared/db.js';
import { connectProducer, isKafkaConnected } from '../../shared/kafka.js';
import { errorResponse } from '../../shared/response.js';
import * as applications from './applications.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try {
    if (await pingDb()) dbState = 'connected';
  } catch { /* leave disconnected */ }
  res.json({ status: 'ok', service: 'application', db: dbState, kafka: isKafkaConnected() ? 'connected' : 'disconnected' });
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json(errorResponse('INTERNAL', e.message || 'Server error'));
  });
};

app.post('/applications/submit', wrap(applications.submit));
app.post('/applications/get', wrap(applications.get));
app.post('/applications/byJob', wrap(applications.byJob));
app.post('/applications/byMember', wrap(applications.byMember));
app.post('/applications/updateStatus', wrap(applications.updateStatus));
app.post('/applications/addNote', wrap(applications.addNote));

app.use((_req, res) => {
  res.status(404).json(errorResponse('NOT_FOUND', 'no route for this path'));
});

const port = Number(process.env.PORT || 8003);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'application', port, status: 'started' }));
  connectProducer().catch(() => {});
});
