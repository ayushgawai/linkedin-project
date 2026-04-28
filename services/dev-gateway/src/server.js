import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PROFILE_URL = process.env.PROFILE_URL || 'http://127.0.0.1:8001';
const JOB_URL = process.env.JOB_URL || 'http://127.0.0.1:8002';
const APPLICATION_URL = process.env.APPLICATION_URL || 'http://127.0.0.1:8003';

function pickUpstream(path) {
  if (path.startsWith('/members') || path.startsWith('/auth') || path.startsWith('/recruiters')) return PROFILE_URL;
  if (path.startsWith('/jobs') || path.startsWith('/companies')) return JOB_URL;
  if (path.startsWith('/applications')) return APPLICATION_URL;
  return null;
}

function unwrap(body) {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) return body.data;
  return body;
}

function normalizeErrorBody(body) {
  // Frontend interceptor looks for top-level { message } when available.
  if (!body || typeof body !== 'object') return { message: 'Unexpected API error', details: body };
  if (typeof body.message === 'string') return body;
  if (body.error && typeof body.error.message === 'string') {
    return { message: body.error.message, code: body.error.code, details: body.error.details, trace_id: body.trace_id };
  }
  return { message: 'Unexpected API error', details: body };
}

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', service: 'dev-gateway' });
});

async function bestEffortRegisterRecruiterWithJobService(payload) {
  try {
    if (!payload?.user?.recruiter_id || !payload?.user?.company_id) return;
    await fetch(`${JOB_URL}/__dev/registerRecruiter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recruiter_id: payload.user.recruiter_id,
        company_id: payload.user.company_id,
        company_industry: payload.user.company_industry || ''
      })
    });
  } catch {
    // ignore
  }
}

async function bestEffortRegisterMemberWithApplicationService(payload) {
  try {
    const memberId = payload?.user?.member_id;
    if (!memberId) return;
    await fetch(`${APPLICATION_URL}/__dev/registerMember`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: memberId })
    });
  } catch {
    // ignore
  }
}

async function bestEffortRegisterJobWithApplicationService(payload) {
  try {
    const jobId = payload?.job_id;
    if (!jobId) return;
    await fetch(`${APPLICATION_URL}/__dev/registerJob`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status: 'open' })
    });
  } catch {
    // ignore
  }
}

app.all('*', async (req, res) => {
  const upstream = pickUpstream(req.path);
  if (!upstream) {
    return res.status(404).json({ message: `No upstream configured for ${req.path}` });
  }

  try {
    const url = `${upstream}${req.path}`;
    const headers = {
      'content-type': 'application/json',
    };
    const auth = req.header('authorization');
    if (auth) headers.authorization = auth;

    const upstreamResp = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
    });

    const text = await upstreamResp.text();
    const parsed = text ? JSON.parse(text) : null;

    if (!upstreamResp.ok) {
      return res.status(upstreamResp.status).json(normalizeErrorBody(parsed));
    }

    const unwrapped = unwrap(parsed);

    // If profile created a recruiter, register it with job memory service.
    if (req.path === '/recruiters/create') {
      await bestEffortRegisterRecruiterWithJobService(unwrapped);
    }

    // If a member was created via signup, register it with application memory service.
    if (req.path === '/members/create') {
      await bestEffortRegisterMemberWithApplicationService(unwrapped);
    }

    // If a job was created, register it with application memory service.
    if (req.path === '/jobs/create') {
      await bestEffortRegisterJobWithApplicationService(unwrapped);
    }

    return res.status(upstreamResp.status).json(unwrapped);
  } catch (err) {
    return res.status(500).json({ message: 'Gateway error', details: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT || 8000);
app.listen(port, () => {
  console.log(JSON.stringify({ service: 'dev-gateway', port, status: 'started' }));
});

