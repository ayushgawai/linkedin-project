import express from 'express';
import cors from 'cors';
import { errorResponse } from '../../shared/response.js';
import { createConsumer } from '../../shared/consumer.js';
import { connectMongo, pingMongo, getDb } from './mongo.js';
import * as analytics from './analytics.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

let consumerRunning = false;

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try { if (await pingMongo()) dbState = 'connected'; } catch { /* */ }
  res.json({
    status: 'ok',
    service: 'analytics',
    db: dbState,
    kafka: consumerRunning ? 'connected' : 'disconnected',
  });
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json(errorResponse('INTERNAL', e.message || 'Server error'));
  });
};

app.post('/events/ingest', wrap(analytics.ingestEvent));
app.post('/analytics/jobs/top', wrap(analytics.topJobs));
app.post('/analytics/funnel', wrap(analytics.funnel));
app.post('/analytics/geo', wrap(analytics.geo));
app.post('/analytics/member/dashboard', wrap(analytics.memberDashboard));

app.use((_req, res) => {
  res.status(404).json(errorResponse('NOT_FOUND', 'analytics service route not found'));
});

async function handleKafkaEvent(envelope) {
  const db = getDb();
  const doc = {
    event_type: envelope.event_type,
    trace_id: envelope.trace_id,
    timestamp: envelope.timestamp ? new Date(envelope.timestamp) : new Date(),
    actor_id: envelope.actor_id,
    entity: envelope.entity,
    payload: envelope.payload || {},
    idempotency_key: envelope.idempotency_key,
  };

  if (doc.idempotency_key) {
    const exists = await db.collection('events').findOne({ idempotency_key: doc.idempotency_key });
    if (exists) return;
  }

  await db.collection('events').insertOne(doc);
}

const port = Number(process.env.PORT || 8006);
app.listen(port, async () => {
  console.log(JSON.stringify({ service: 'analytics', port, status: 'started' }));

  await connectMongo();

  const consumer = createConsumer('analytics-consumer', {
    'job.viewed': handleKafkaEvent,
    'application.submitted': handleKafkaEvent,
    'application.status.updated': handleKafkaEvent,
  });
  consumer.start().then(() => { consumerRunning = true; }).catch(() => {});
});
