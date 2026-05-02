/**
 * In-memory Bearer sessions registered from successful auth/signup responses.
 * Authorizes sensitive application + job mutations when requests hit the dev gateway.
 *
 * Direct calls to microservices (bypassing the gateway) are unchanged — useful for pytest.
 */

/** @typedef {{ role: string, member_id: string, recruiter_id: string | null }} Session */

const sessions = new Map();

/**
 * @param {unknown} data
 */
export function registerSuccessfulAuthPayload(data) {
  if (!data || typeof data !== 'object') return;
  const token = /** @type {{ token?: string }} */ (data).token;
  const user = /** @type {{ token?: string; user?: Record<string, unknown> }} */ (data).user;
  if (typeof token !== 'string' || !token || !user || typeof user !== 'object') return;
  const role = typeof user.role === 'string' ? user.role : 'member';
  const member_id = typeof user.member_id === 'string' ? user.member_id : '';
  if (!member_id) return;
  const recruiter_id =
    typeof user.recruiter_id === 'string' ? user.recruiter_id : role === 'recruiter' ? member_id : null;
  sessions.set(token, { role, member_id, recruiter_id });
}

function parseBearer(req) {
  const auth = req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

/**
 * @param {import('express').Request} req
 * @returns {Session | null}
 */
export function getSession(req) {
  const token = parseBearer(req);
  if (!token) return null;
  return sessions.get(token) ?? null;
}

function unwrapBody(body) {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body && body.success === true) {
    return body.data;
  }
  return body;
}

/**
 * @param {string} applicationUrl
 * @param {string} applicationId
 */
async function fetchApplication(applicationUrl, applicationId) {
  const r = await fetch(`${applicationUrl}/applications/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ application_id: applicationId }),
  });
  const text = await r.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!r.ok) return null;
  return unwrapBody(parsed);
}

/**
 * @param {string} jobUrl
 * @param {string} jobId
 */
async function fetchJob(jobUrl, jobId) {
  const r = await fetch(`${jobUrl}/jobs/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  });
  const text = await r.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!r.ok) return null;
  return unwrapBody(parsed);
}

/**
 * @param {Session} s
 * @param {{ recruiter_id?: string }} job
 */
function recruiterOwnsJob(s, job) {
  if (!job?.recruiter_id || s.role !== 'recruiter') return false;
  const rid = s.recruiter_id || s.member_id;
  return rid === job.recruiter_id;
}

/**
 * @param {Session} s
 * @param {{ member_id?: string, job_id?: string }} application
 * @param {{ recruiter_id?: string } | null} job
 */
function canAccessApplication(s, application, job) {
  if (!application?.member_id || !application?.job_id) return false;
  if (s.member_id === application.member_id && s.role === 'member') return true;
  if (job && recruiterOwnsJob(s, job)) return true;
  return false;
}

/**
 * @param {{ status: number, message: string }} err
 */
function deny(err) {
  return { ok: false, ...err };
}

/**
 * @param {import('express').Request} req
 * @param {{ jobUrl: string, applicationUrl: string }} env
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function authorizeRequest(req, env) {
  const path = req.path;
  const method = req.method;
  const { jobUrl, applicationUrl } = env;

  // ── Applications ───────────────────────────────────────────────────────────
  if (path.startsWith('/applications')) {
    // REST submit
    if (path === '/applications' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const memberId = req.body?.member_id;
      if (typeof memberId !== 'string' || memberId !== session.member_id) {
        return deny({ status: 403, message: 'Cannot submit application for another member' });
      }
      return { ok: true };
    }

    if (path === '/applications/submit' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const memberId = req.body?.member_id;
      if (typeof memberId !== 'string' || memberId !== session.member_id) {
        return deny({ status: 403, message: 'Cannot submit application for another member' });
      }
      return { ok: true };
    }

    if (path === '/applications/byMember' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const mid = req.body?.member_id;
      if (session.role !== 'member' || typeof mid !== 'string' || mid !== session.member_id) {
        return deny({ status: 403, message: 'Cannot list applications for another member' });
      }
      return { ok: true };
    }

    if (path === '/applications/byJob' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const jobId = req.body?.job_id;
      if (typeof jobId !== 'string' || !jobId) return deny({ status: 400, message: 'job_id required' });
      if (session.role !== 'recruiter') {
        return deny({ status: 403, message: 'Only recruiters can list applicants by job' });
      }
      const job = await fetchJob(jobUrl, jobId);
      if (!job) return deny({ status: 404, message: 'Job not found' });
      if (!recruiterOwnsJob(session, job)) {
        return deny({ status: 403, message: 'Cannot access applicants for another recruiter job' });
      }
      return { ok: true };
    }

    if (path === '/applications/get' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const applicationId = req.body?.application_id;
      if (typeof applicationId !== 'string') return deny({ status: 400, message: 'application_id required' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!canAccessApplication(session, application, job)) {
        return deny({ status: 403, message: 'Cannot access this application' });
      }
      return { ok: true };
    }

    if (path === '/applications/updateStatus' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const applicationId = req.body?.application_id;
      if (typeof applicationId !== 'string') return deny({ status: 400, message: 'application_id required' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!canAccessApplication(session, application, job)) {
        return deny({ status: 403, message: 'Cannot update this application' });
      }
      return { ok: true };
    }

    if (path === '/applications/addNote' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can add notes' });
      const applicationId = req.body?.application_id;
      if (typeof applicationId !== 'string') return deny({ status: 400, message: 'application_id required' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!job || !recruiterOwnsJob(session, job)) {
        return deny({ status: 403, message: 'Cannot add notes for this application' });
      }
      return { ok: true };
    }

    const getOne = path.match(/^\/applications\/([^/]+)$/);
    if (getOne && method === 'GET') {
      const applicationId = getOne[1];
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!canAccessApplication(session, application, job)) {
        return deny({ status: 403, message: 'Cannot access this application' });
      }
      return { ok: true };
    }

    const patchStatus = path.match(/^\/applications\/([^/]+)\/status$/);
    if (patchStatus && method === 'PATCH') {
      const applicationId = patchStatus[1];
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!canAccessApplication(session, application, job)) {
        return deny({ status: 403, message: 'Cannot update this application' });
      }
      return { ok: true };
    }

    const postNotes = path.match(/^\/applications\/([^/]+)\/notes$/);
    if (postNotes && method === 'POST') {
      const applicationId = postNotes[1];
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can add notes' });
      const application = await fetchApplication(applicationUrl, applicationId);
      if (!application) return deny({ status: 404, message: 'Application not found' });
      const job = await fetchJob(jobUrl, application.job_id);
      if (!job || !recruiterOwnsJob(session, job)) {
        return deny({ status: 403, message: 'Cannot add notes for this application' });
      }
      return { ok: true };
    }

    if (path === '/applications' && method === 'GET') {
      const memberId = typeof req.query?.member_id === 'string' ? req.query.member_id : null;
      const jobId = typeof req.query?.job_id === 'string' ? req.query.job_id : null;
      if (!memberId && !jobId) {
        return deny({ status: 400, message: 'job_id or member_id query param is required' });
      }
      if (memberId && jobId) {
        return deny({ status: 400, message: 'Specify only one of job_id or member_id' });
      }
      if (memberId) {
        const session = getSession(req);
        if (!session) return deny({ status: 401, message: 'Authentication required' });
        if (session.role !== 'member' || session.member_id !== memberId) {
          return deny({ status: 403, message: 'Cannot list applications for another member' });
        }
        return { ok: true };
      }
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') {
        return deny({ status: 403, message: 'Only recruiters can list applicants by job' });
      }
      const job = await fetchJob(jobUrl, jobId);
      if (!job) return deny({ status: 404, message: 'Job not found' });
      if (!recruiterOwnsJob(session, job)) {
        return deny({ status: 403, message: 'Cannot access applicants for another recruiter job' });
      }
      return { ok: true };
    }
  }

  // ── Jobs (recruiter ownership) ─────────────────────────────────────────────
  if (path.startsWith('/jobs')) {
    if ((path === '/jobs' || path === '/jobs/create') && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can create jobs' });
      const rid = req.body?.recruiter_id;
      if (typeof rid !== 'string' || rid !== (session.recruiter_id || session.member_id)) {
        return deny({ status: 403, message: 'Cannot create jobs for another recruiter' });
      }
      return { ok: true };
    }

    if (path === '/jobs/byRecruiter' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can list jobs by recruiter' });
      const rid = req.body?.recruiter_id;
      if (typeof rid !== 'string' || rid !== (session.recruiter_id || session.member_id)) {
        return deny({ status: 403, message: 'Cannot list jobs for another recruiter' });
      }
      return { ok: true };
    }

    if (path === '/jobs/update' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can update jobs' });
      const jobId = req.body?.job_id;
      if (typeof jobId !== 'string') return deny({ status: 400, message: 'job_id required' });
      const job = await fetchJob(jobUrl, jobId);
      if (!job) return deny({ status: 404, message: 'Job not found' });
      if (!recruiterOwnsJob(session, job)) return deny({ status: 403, message: 'Cannot update another recruiter job' });
      return { ok: true };
    }

    if (path === '/jobs/close' && method === 'POST') {
      const session = getSession(req);
      if (!session) return deny({ status: 401, message: 'Authentication required' });
      if (session.role !== 'recruiter') return deny({ status: 403, message: 'Only recruiters can close jobs' });
      const jobId = req.body?.job_id;
      if (typeof jobId !== 'string') return deny({ status: 400, message: 'job_id required' });
      const job = await fetchJob(jobUrl, jobId);
      if (!job) return deny({ status: 404, message: 'Job not found' });
      if (!recruiterOwnsJob(session, job)) return deny({ status: 403, message: 'Cannot close another recruiter job' });
      return { ok: true };
    }
  }

  return { ok: true };
}
