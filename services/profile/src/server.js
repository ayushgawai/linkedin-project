import crypto from 'node:crypto';
import express from 'express';
import { pingDb } from './db.js';
import * as members from './members.js';

const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try {
    if (await pingDb()) {
      dbState = 'connected';
    }
  } catch {
    dbState = 'disconnected';
  }
  // Kafka: wire when this service produces events; contract allows disconnected until then
  res.json({ status: 'ok', service: 'profile', db: dbState, kafka: 'disconnected' });
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: e.message || 'Server error', details: {} },
      trace_id: crypto.randomUUID(),
    });
  });
};

app.post('/members/create', wrap(members.createMember));
app.post('/members/get', wrap(members.getMember));
app.post('/members/update', wrap(members.updateMember));
app.post('/members/delete', wrap(members.deleteMember));
app.post('/members/search', wrap(members.searchMembers));

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'no route for this path', details: {} },
    trace_id: crypto.randomUUID(),
  });
});

const port = Number(process.env.PORT || 8001);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'profile', port, status: 'started' }));
});
