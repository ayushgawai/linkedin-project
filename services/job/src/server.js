import express from 'express';
import cors from 'cors';
import { pingDb } from '../../shared/db.js';
import { errorResponse } from '../../shared/response.js';
import * as jobs from './jobs.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  let dbState = 'disconnected';
  try {
    if (await pingDb()) dbState = 'connected';
  } catch { /* leave disconnected */ }
  res.json({ status: 'ok', service: 'job', db: dbState, kafka: 'disconnected' });
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json(errorResponse('INTERNAL', e.message || 'Server error'));
  });
};

app.post('/jobs/create', wrap(jobs.createJob));
app.post('/jobs/get', wrap(jobs.getJob));
app.post('/jobs/update', wrap(jobs.updateJob));
app.post('/jobs/search', wrap(jobs.searchJobs));
app.post('/jobs/close', wrap(jobs.closeJob));
app.post('/jobs/byRecruiter', wrap(jobs.byRecruiter));

app.use((_req, res) => {
  res.status(404).json(errorResponse('NOT_FOUND', 'no route for this path'));
});

const port = Number(process.env.PORT || 8002);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'job', port, status: 'started' }));
});
