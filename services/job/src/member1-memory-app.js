import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';

import { getPagination, normalizeStringArray, sendError, sendSuccess } from '../../shared/src/http.js';
import { checkMySqlHealth, query, withTransaction } from '../../shared/src/mysql.js';
import { NotFoundError, ValidationError, optionalString, requireString } from '../../shared/src/validation.js';
import { publishOrOutbox } from '../../shared/src/outbox.js';
import { buildEnvelope, isKafkaConnected } from '../../shared/src/kafka.js';

const SENIORITY = new Set(['internship', 'entry', 'associate', 'mid', 'senior', 'director', 'executive']);
const EMPLOYMENT = new Set(['full_time', 'part_time', 'contract', 'temporary', 'volunteer', 'internship']);
const REMOTE = new Set(['onsite', 'remote', 'hybrid']);
const STATUS = new Set(['open', 'closed']);

function validateEnum(value, fieldName, values) {
  if (!values.has(value)) {
    throw new ValidationError(`${fieldName} must be one of ${[...values].join(', ')}`, { field: fieldName });
  }
  return value;
}

function validateCreatePayload(body) {
  // Supports two payload shapes:
  // - Professor/contract shape (explicit enums + company_id)
  // - Frontend "Hiring Pro" shape (minimal required fields + work_mode / industry etc.)
  const recruiter_id = requireString(body.recruiter_id, 'recruiter_id');
  const title = requireString(body.title, 'title');
  const description = requireString(body.description, 'description');
  const professorMode = 'seniority_level' in body || 'company_id' in body;
  const location = professorMode ? optionalString(body.location) : requireString(body.location ?? '', 'location');

  const remote_type = body.work_mode
    ? validateEnum(requireString(body.work_mode, 'work_mode'), 'work_mode', REMOTE)
    : validateEnum(requireString(body.remote_type || 'onsite', 'remote_type'), 'remote_type', REMOTE);

  const employment_type = body.type
    ? validateEnum(requireString(body.type, 'type'), 'type', EMPLOYMENT)
    : validateEnum(requireString(body.employment_type || 'full_time', 'employment_type'), 'employment_type', EMPLOYMENT);

  const seniority_level = body.seniority_level
    ? validateEnum(requireString(body.seniority_level, 'seniority_level'), 'seniority_level', SENIORITY)
    : 'mid';

  return {
    company_id: optionalString(body.company_id),
    recruiter_id,
    title,
    description,
    seniority_level,
    employment_type,
    location,
    remote_type,
    skills_required: normalizeStringArray(body.skills_required ?? body.skills),
    salary_range: optionalString(body.salary_range),
    status: validateEnum(requireString(body.status || 'open', 'status'), 'status', STATUS),
    // extra frontend-friendly fields (best-effort)
    company_name: optionalString(body.company_name),
    company_logo_url: optionalString(body.company_logo_url),
    industry: optionalString(body.industry),
    easy_apply: body.easy_apply !== false,
    promoted: body.promoted !== false,
    company_about: optionalString(body.company_about),
    followers_count: Number.isFinite(Number(body.followers_count)) ? Number(body.followers_count) : null,
    company_size: optionalString(body.company_size)
  };
}

function validateUpdatePayload(body) {
  requireString(body.job_id, 'job_id');
  const changes = {};

  for (const field of ['company_id', 'recruiter_id', 'title', 'description', 'location']) {
    if (field in body) {
      changes[field] = requireString(body[field], field);
    }
  }
  if ('salary_range' in body) {
    changes.salary_range = optionalString(body.salary_range);
  }

  if ('seniority_level' in body) {
    changes.seniority_level = validateEnum(requireString(body.seniority_level, 'seniority_level'), 'seniority_level', SENIORITY);
  }
  if ('employment_type' in body) {
    changes.employment_type = validateEnum(requireString(body.employment_type, 'employment_type'), 'employment_type', EMPLOYMENT);
  }
  if ('remote_type' in body) {
    changes.remote_type = validateEnum(requireString(body.remote_type, 'remote_type'), 'remote_type', REMOTE);
  }
  if ('status' in body) {
    changes.status = validateEnum(requireString(body.status, 'status'), 'status', STATUS);
  }
  if ('skills_required' in body) {
    changes.skills_required = normalizeStringArray(body.skills_required);
  }

  if (!Object.keys(changes).length) {
    throw new ValidationError('at least one field to update is required');
  }

  return { job_id: body.job_id, changes };
}

async function hydrateJob(jobId, executor = query) {
  const [jobRows] = await executor(
    `SELECT j.job_id, j.company_id, j.recruiter_id, j.title, j.description, j.seniority_level,
            j.employment_type, j.location, j.remote_type, j.salary_range, j.status,
            j.posted_datetime, j.views_count, j.applicants_count,
            r.company_industry, r.company_name
       FROM jobs j
  LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
      WHERE j.job_id = ?`,
    [jobId]
  );

  if (!jobRows.length) {
    return null;
  }

  const [skillRows] = await executor('SELECT skill FROM job_skills WHERE job_id = ? ORDER BY skill', [jobId]);
  const row = jobRows[0];
  // Adapt to frontend `JobRecord` fields (best-effort defaults).
  const posted = row.posted_datetime ? new Date(row.posted_datetime) : new Date();
  const minutes = Math.max(0, Math.round((Date.now() - posted.getTime()) / 60000));
  const posted_time_ago = minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;

  return {
    job_id: row.job_id,
    recruiter_id: row.recruiter_id,
    company_id: row.company_id,
    title: row.title,
    description: row.description,
    location: row.location || '',
    work_mode: row.remote_type,
    employment_type: row.employment_type || 'full_time',
    industry: row.company_industry || '',
    company_name: row.company_name || '',
    company_logo_url: null,
    easy_apply: true,
    promoted: true,
    posted_time_ago,
    applicants_count: row.applicants_count ?? 0,
    views_count: row.views_count ?? 0,
    skills_required: skillRows.map((r) => r.skill),
    connections_count: 0,
    followers_count: 0,
    company_size: '',
    company_about: '',
    salary_range: row.salary_range || null
  };
}

export function createJobMySqlRepository() {
  return {
    async health() {
      return checkMySqlHealth();
    },

    async createJob(input) {
      return withTransaction(async (connection) => {
        const [recruiterRows] = await connection.execute(
          'SELECT recruiter_id, company_id, company_name, company_industry, company_size FROM recruiters WHERE recruiter_id = ?',
          [input.recruiter_id]
        );

        if (!recruiterRows.length) {
          return { recruiterMissing: true };
        }

        const recruiter = recruiterRows[0];
        const companyId = input.company_id || recruiter.company_id;

        const jobId = randomUUID();
        await connection.execute(
          `INSERT INTO jobs
            (job_id, company_id, recruiter_id, title, description, seniority_level, employment_type, location, remote_type, salary_range, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            jobId,
            companyId,
            input.recruiter_id,
            input.title,
            input.description,
            input.seniority_level,
            input.employment_type,
            input.location,
            input.remote_type,
            input.salary_range,
            input.status
          ]
        );

        for (const skill of input.skills_required) {
          await connection.execute('INSERT INTO job_skills (job_id, skill) VALUES (?, ?)', [jobId, skill]);
        }

        return hydrateJob(jobId, connection.query.bind(connection));
      });
    },

    async getJob(jobId) {
      return hydrateJob(jobId);
    },

    async incrementViews(jobId) {
      await query('UPDATE jobs SET views_count = views_count + 1 WHERE job_id = ?', [jobId]);
    },

    async incrementApplicants(jobId) {
      // Make this idempotent by recomputing from truth (applications table).
      // This avoids double-counting when both /applications/submit and frontend-side
      // tracking call the increment endpoint.
      await query(
        `UPDATE jobs
            SET applicants_count = (
              SELECT COUNT(*) FROM applications WHERE job_id = ?
            )
          WHERE job_id = ?`,
        [jobId, jobId]
      );
    },

    async updateJob(jobId, changes) {
      const existing = await hydrateJob(jobId);
      if (!existing) {
        return null;
      }

      try {
        return await withTransaction(async (connection) => {
          const next = { ...existing, ...changes };

          if ('recruiter_id' in changes) {
            const [recruiterRows] = await connection.execute(
              'SELECT recruiter_id FROM recruiters WHERE recruiter_id = ?',
              [next.recruiter_id]
            );

            if (!recruiterRows.length) {
              return { recruiterMissing: true };
            }
          }

          await connection.execute(
            `UPDATE jobs
                SET company_id = ?, recruiter_id = ?, title = ?, description = ?, seniority_level = ?,
                    employment_type = ?, location = ?, remote_type = ?, salary_range = ?, status = ?
              WHERE job_id = ?`,
            [
              next.company_id,
              next.recruiter_id,
              next.title,
              next.description,
              next.seniority_level,
              next.employment_type,
              next.location,
              next.remote_type,
              next.salary_range,
              next.status,
              jobId
            ]
          );

          if ('skills_required' in changes) {
            await connection.execute('DELETE FROM job_skills WHERE job_id = ?', [jobId]);
            for (const skill of changes.skills_required) {
              await connection.execute('INSERT INTO job_skills (job_id, skill) VALUES (?, ?)', [jobId, skill]);
            }
          }

          return hydrateJob(jobId, connection.query.bind(connection));
        });
      } catch (error) {
        throw error;
      }
    },

    async searchJobs(filters) {
      const params = [];
      const conditions = [];

      if (filters.keyword) {
        conditions.push('(j.title LIKE ? OR j.description LIKE ? OR j.location LIKE ?)');
        const keyword = `%${filters.keyword}%`;
        params.push(keyword, keyword, keyword);
      }
      if (filters.location) {
        conditions.push('j.location LIKE ?');
        params.push(`%${filters.location}%`);
      }
      if (filters.employment_type) {
        conditions.push('j.employment_type = ?');
        params.push(filters.employment_type);
      }
      if (filters.remote_type) {
        conditions.push('j.remote_type = ?');
        params.push(filters.remote_type);
      }
      if (filters.industry) {
        conditions.push('r.company_industry LIKE ?');
        params.push(`%${filters.industry}%`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const offset = (filters.page - 1) * filters.pageSize;
      const [[countRow]] = await query(
        `SELECT COUNT(*) AS total
           FROM jobs j
      LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
           ${whereClause}`,
        params
      );
      const [rows] = await query(
        `SELECT j.job_id
           FROM jobs j
      LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
           ${whereClause}
       ORDER BY j.posted_datetime DESC
          LIMIT ? OFFSET ?`,
        [...params, filters.pageSize, offset]
      );

      const results = await Promise.all(rows.map((row) => hydrateJob(row.job_id)));
      return { results, total: countRow.total, page: filters.page };
    },

    async closeJob(jobId) {
      const job = await hydrateJob(jobId);
      if (!job) {
        return { notFound: true };
      }
      if (job.status === 'closed') {
        return { alreadyClosed: true };
      }

      await query('UPDATE jobs SET status = ? WHERE job_id = ?', ['closed', jobId]);
      return { status: 'closed' };
    },

    async listByRecruiter(recruiterId, page, pageSize) {
      const [[countRow]] = await query('SELECT COUNT(*) AS total FROM jobs WHERE recruiter_id = ?', [recruiterId]);
      const [rows] = await query(
        `SELECT job_id
           FROM jobs
          WHERE recruiter_id = ?
       ORDER BY posted_datetime DESC
          LIMIT ? OFFSET ?`,
        [recruiterId, pageSize, (page - 1) * pageSize]
      );
      const results = await Promise.all(rows.map((row) => hydrateJob(row.job_id)));
      return { results, total: countRow.total, page };
    }
  };
}

function handleError(res, error) {
  if (error instanceof ValidationError) {
    return sendError(res, 400, 'VALIDATION_ERROR', error.message, error.details);
  }

  if (error instanceof NotFoundError) {
    return sendError(res, 404, error.code, error.message, error.details);
  }

  if (error.code === 'RECRUITER_NOT_FOUND') {
    return sendError(res, 404, 'RECRUITER_NOT_FOUND', 'recruiter was not found');
  }

  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'unexpected server error');
}

export function createJobApp({ repository }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const db = await repository.health();
    const kafkaOk = isKafkaConnected();
    res.json({ status: db === 'connected' ? 'ok' : 'degraded', service: 'job', db, kafka: kafkaOk ? 'connected' : 'disconnected' });
  });

  // Dev-only: allow other services to register recruiters in memory-mode.
  app.post('/__dev/registerRecruiter', async (req, res) => {
    try {
      const recruiter_id = requireString(req.body.recruiter_id, 'recruiter_id');
      const company_id = requireString(req.body.company_id, 'company_id');
      const company_industry = optionalString(req.body.company_industry) || '';
      repository.addRecruiter?.({ recruiter_id, company_id, company_industry });
      return sendSuccess(res, { registered: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/create', async (req, res) => {
    try {
      const created = await repository.createJob(validateCreatePayload(req.body));
      if (created?.recruiterMissing) {
        throw new NotFoundError('RECRUITER_NOT_FOUND', 'recruiter was not found');
      }
      return sendSuccess(res, created, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/get', async (req, res) => {
    try {
      const jobId = requireString(req.body.job_id, 'job_id');
      const job = await repository.getJob(jobId);
      if (!job) {
        throw new NotFoundError('JOB_NOT_FOUND', 'job was not found');
      }

      return sendSuccess(res, job);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/incrementViews', async (req, res) => {
    try {
      const jobId = requireString(req.body.job_id, 'job_id');
      const viewerId = optionalString(req.body.viewer_id) || 'anonymous';
      const job = await repository.getJob(jobId);
      if (!job) {
        throw new NotFoundError('JOB_NOT_FOUND', 'job was not found');
      }

      await repository.incrementViews(jobId);
      publishOrOutbox('job.viewed', buildEnvelope({
        eventType: 'job.viewed',
        actorId: viewerId,
        entityType: 'job',
        entityId: jobId,
        payload: { job_id: jobId, title: job.title }
      })).catch(() => {});

      return sendSuccess(res, { success: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/incrementApplicants', async (req, res) => {
    try {
      const jobId = requireString(req.body.job_id, 'job_id');
      const job = await repository.getJob(jobId);
      if (!job) {
        throw new NotFoundError('JOB_NOT_FOUND', 'job was not found');
      }
      if (repository.incrementApplicants) {
        await repository.incrementApplicants(jobId);
      }
      return sendSuccess(res, { success: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/companies/incrementViews', async (req, res) => {
    // Frontend calls this for demo company pages. Backend does not persist company view counters yet.
    // Keep as a successful no-op so live mode doesn't break.
    try {
      requireString(req.body.company_name, 'company_name');
      return sendSuccess(res, { success: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/update', async (req, res) => {
    try {
      const { job_id: jobId, changes } = validateUpdatePayload(req.body);
      const job = await repository.updateJob(jobId, changes);
      if (job?.recruiterMissing) {
        throw new NotFoundError('RECRUITER_NOT_FOUND', 'recruiter was not found');
      }
      if (!job) {
        throw new NotFoundError('JOB_NOT_FOUND', 'job was not found');
      }
      return sendSuccess(res, job);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/search', async (req, res) => {
    try {
      const { page, pageSize } = getPagination(req.body);
      const result = await repository.searchJobs({
        keyword: optionalString(req.body.keyword),
        location: optionalString(req.body.location),
        employment_type: optionalString(req.body.employment_type) || optionalString(req.body.type),
        industry: optionalString(req.body.industry),
        remote_type: optionalString(req.body.remote_type) || (req.body.remote === true ? 'remote' : null),
        page,
        pageSize
      });
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/close', async (req, res) => {
    try {
      const result = await repository.closeJob(requireString(req.body.job_id, 'job_id'));
      if (result.notFound) {
        return sendError(res, 404, 'JOB_NOT_FOUND', 'job was not found');
      }
      if (result.alreadyClosed) {
        return sendError(res, 409, 'ALREADY_CLOSED', 'job is already closed');
      }
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/jobs/byRecruiter', async (req, res) => {
    try {
      const recruiterId = requireString(req.body.recruiter_id, 'recruiter_id');
      const { page, pageSize } = getPagination(req.body);
      const result = await repository.listByRecruiter(recruiterId, page, pageSize);
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  return app;
}
