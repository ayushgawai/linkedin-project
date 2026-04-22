import express from 'express';
import cors from 'cors';
import { pingDb } from './db.js';
import { errorResponse } from '../../shared/response.js';
import * as members from './members.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try {
    if (await pingDb()) dbState = 'connected';
  } catch { /* leave disconnected */ }
  res.json({ status: 'ok', service: 'profile', db: dbState, kafka: 'disconnected' });
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json(errorResponse('INTERNAL', e.message || 'Server error'));
  });
};

app.post('/members/create', wrap(members.createMember));
app.post('/members/get', wrap(members.getMember));
app.post('/members/update', wrap(members.updateMember));
app.post('/members/delete', wrap(members.deleteMember));
app.post('/members/search', wrap(members.searchMembers));

app.use((_req, res) => {
  res.status(404).json(errorResponse('NOT_FOUND', 'no route for this path'));
});

const port = Number(process.env.PORT || 8001);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'profile', port, status: 'started' }));
});
