import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import httpProxy from 'http-proxy';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Explicitly handle CORS preflight so OPTIONS doesn't get proxied upstream.
// Without this, browsers preflight POSTs (e.g. with Authorization header),
// the gateway forwards OPTIONS to services that don't implement it, and the
// browser blocks the actual request after a 404.
app.options('*', cors());

const PROFILE_URL = process.env.PROFILE_URL || 'http://profile:8001';
const JOB_URL = process.env.JOB_URL || 'http://job:8002';
const APPLICATION_URL = process.env.APPLICATION_URL || 'http://application:8003';
const MESSAGING_URL = process.env.MESSAGING_URL || 'http://messaging:8004';
const CONNECTION_URL = process.env.CONNECTION_URL || 'http://connection:8005';
const ANALYTICS_URL = process.env.ANALYTICS_URL || 'http://analytics:8006';
const AI_URL = process.env.AI_URL || 'http://ai-agent:8007';

function pickUpstream(path) {
  if (path.startsWith('/members') || path.startsWith('/auth')) return PROFILE_URL;
  // NOTE: Recruiter signup (/recruiters/create) lives in the Profile service (auth-ish),
  // while recruiter CRUD (/recruiters) is implemented in the Job service.
  if (path === '/recruiters/create') return PROFILE_URL;
  if (path.startsWith('/recruiters')) return JOB_URL;
  if (path.startsWith('/jobs') || path.startsWith('/companies')) return JOB_URL;
  if (path.startsWith('/applications')) return APPLICATION_URL;
  if (path.startsWith('/threads') || path.startsWith('/messages')) return MESSAGING_URL;
  if (path.startsWith('/connections')) return CONNECTION_URL;
  if (path.startsWith('/events') || path.startsWith('/analytics')) return ANALYTICS_URL;
  if (path.startsWith('/ai')) return AI_URL;
  return null;
}

function unwrap(body) {
  if (body && typeof body === 'object' && body.success === true && 'data' in body) return body.data;
  return body;
}

function normalizeErrorBody(body) {
  // Frontend axios interceptor expects a top-level `message` when possible.
  if (!body || typeof body !== 'object') return { message: 'Unexpected API error', details: body };
  if (typeof body.message === 'string') return body;
  if (body.error && typeof body.error.message === 'string') {
    return { message: body.error.message, code: body.error.code, details: body.error.details, trace_id: body.trace_id };
  }
  return { message: 'Unexpected API error', details: body };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

// ---------------------------------------------------------------------------
// WebSocket proxy (AI streaming)
// ---------------------------------------------------------------------------
// The frontend + QA harness may connect to ws://<gateway>/ai/stream/:task_id.
// Express alone doesn't proxy WS; we handle HTTP upgrade frames here.
const wsProxy = httpProxy.createProxyServer({
  target: AI_URL,
  ws: true,
  changeOrigin: true,
});

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  const parsed = text ? JSON.parse(text) : null;
  return { resp, parsed };
}

function toTrackerJob(job, fallbackAppliedAt) {
  const status = job?.status === 'closed' ? 'closed' : 'open';
  const posted = job?.created_at || job?.posted_at || fallbackAppliedAt || new Date().toISOString();
  const workMode = job?.remote_type === 'remote' || job?.remote_type === 'hybrid' || job?.remote_type === 'onsite'
    ? job.remote_type
    : 'onsite';
  return {
    title: job?.title ?? 'Job',
    company_name: job?.company_name ?? 'Company',
    company_logo_url: job?.company_logo_url ?? null,
    location: job?.location ?? '',
    work_mode: workMode,
    posted_at: posted,
    reposted_at: null,
    listing_status: status,
  };
}

// Aggregate applications with job metadata for the Job Tracker UI.
app.post('/applications/byMember', async (req, res) => {
  try {
    const url = `${APPLICATION_URL}/applications/byMember`;
    const headers = { 'content-type': 'application/json' };
    const auth = req.header('authorization');
    if (auth) headers.authorization = auth;

    const { resp: appsResp, parsed: appsParsed } = await fetchJson(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {}),
    });

    if (!appsResp.ok) {
      return res.status(appsResp.status).json(normalizeErrorBody(appsParsed));
    }

    const appsBody = unwrap(appsParsed);
    const results = Array.isArray(appsBody?.results) ? appsBody.results : Array.isArray(appsBody) ? appsBody : [];

    const jobCache = new Map();
    async function getJob(job_id) {
      if (!job_id) return null;
      if (jobCache.has(job_id)) return jobCache.get(job_id);
      const p = (async () => {
        const { resp: jobResp, parsed: jobParsed } = await fetchJson(`${JOB_URL}/jobs/get`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
          body: JSON.stringify({ job_id }),
        });
        if (!jobResp.ok) return null;
        return unwrap(jobParsed);
      })();
      jobCache.set(job_id, p);
      return p;
    }

    const enriched = await Promise.all(
      results.map(async (a) => {
        const job = await getJob(a.job_id);
        const appliedAt = a.applied_at || a.application_datetime;
        return {
          application_id: a.application_id,
          job_id: a.job_id,
          member_id: a.member_id,
          status: a.status,
          applied_at: appliedAt || new Date().toISOString(),
          updated_at: a.updated_at || a.application_datetime || appliedAt || new Date().toISOString(),
          rejected_from: a.rejected_from,
          job: toTrackerJob(job, appliedAt),
          connection_avatar_urls: Array.isArray(a.connection_avatar_urls) ? a.connection_avatar_urls : [],
        };
      }),
    );

    return res.status(appsResp.status).json({
      results: enriched,
      total: Number(appsBody?.total ?? enriched.length),
      page: Number(appsBody?.page ?? 1),
      page_size: Number(appsBody?.page_size ?? 50),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Gateway error', details: String(err?.message || err) });
  }
});

app.all('*', async (req, res) => {
  const upstream = pickUpstream(req.path);
  if (!upstream) {
    return res.status(404).json({ message: `No upstream configured for ${req.path}` });
  }

  try {
    const url = `${upstream}${req.path}`;
    const headers = { 'content-type': 'application/json' };
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

    return res.status(upstreamResp.status).json(unwrap(parsed));
  } catch (err) {
    return res.status(500).json({ message: 'Gateway error', details: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT || 8000);
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  try {
    const url = req.url || '';
    // Proxy AI stream sockets via gateway.
    if (url.startsWith('/ai/stream/') || url.startsWith('/ai/tasks/')) {
      wsProxy.ws(req, socket, head);
      return;
    }
  } catch {
    // fall through to destroy
  }
  socket.destroy();
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ service: 'api-gateway', port, status: 'started' }));
});

