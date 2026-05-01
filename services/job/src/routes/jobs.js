// Minimal Job Service read/write paths.
// TEMPORARY: exists to unblock Member 5 benchmarks until Ayush ships the
// real Job Service. Cache-aside + invalidation wiring is permanent — the
// real implementation can layer on top.

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';
import { getOrSet, invalidate, invalidatePrefix, keys } from '../../../shared/cache.js';
import { config } from '../config.js';

export const jobsRouter = Router();

const SENIORITY = ['internship', 'entry', 'associate', 'mid', 'senior', 'director', 'executive'];
const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'temporary', 'volunteer', 'internship'];
const REMOTE = ['onsite', 'remote', 'hybrid'];

const FALLBACK_SKILL_PATTERNS = [
  ['python', 'Python'],
  ['kafka', 'Kafka'],
  ['redis', 'Redis'],
  ['react', 'React'],
  ['typescript', 'TypeScript'],
  ['javascript', 'JavaScript'],
  ['node', 'Node.js'],
  ['express', 'Express'],
  ['mysql', 'MySQL'],
  ['mongodb', 'MongoDB'],
  ['docker', 'Docker'],
  ['kubernetes', 'Kubernetes'],
  ['aws', 'AWS'],
  ['java', 'Java'],
  ['spark', 'Spark'],
  ['airflow', 'Airflow'],
  ['sql', 'SQL'],
];

function inferSkillsRequired(job) {
  const text = `${job?.title ?? ''} ${job?.description ?? ''}`.toLowerCase();
  const inferred = FALLBACK_SKILL_PATTERNS
    .filter(([needle]) => text.includes(needle))
    .map(([, label]) => label);

  // Legacy seed rows may not have job_skills populated. Return a stable
  // fallback so /jobs/get and coaching flows still have skill context.
  if (inferred.length > 0) return inferred;
  return ['Python', 'Kafka', 'Redis'];
}

async function fetchJob(job_id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT j.*, r.company_name, r.company_industry
       FROM jobs j
       LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
      WHERE j.job_id = :job_id
      LIMIT 1`,
    { job_id },
  );
  if (rows.length === 0) return null;
  const [skills] = await pool.query('SELECT skill FROM job_skills WHERE job_id = :job_id', { job_id });
  const skillsRequired = skills.map((s) => s.skill).filter(Boolean);
  return {
    ...rows[0],
    skills_required: skillsRequired.length > 0 ? skillsRequired : inferSkillsRequired(rows[0]),
  };
}

const CreateProfessorSchema = z.object({
  company_id: z.string().min(1),
  recruiter_id: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  seniority_level: z.enum(SENIORITY).optional(),
  employment_type: z.enum(EMPLOYMENT).optional(),
  location: z.string().max(255).optional().nullable(),
  remote_type: z.enum(REMOTE).default('onsite'),
  salary_range: z.string().max(100).optional().nullable(),
  skills_required: z.array(z.string()).optional().default([]),
  status: z.enum(['open', 'closed']).default('open'),
});

const CreateFrontendSchema = z.object({
  recruiter_id: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  location: z.string().min(1).max(255),
  work_mode: z.enum(REMOTE).optional(),
  employment_type: z.enum(EMPLOYMENT).optional(),
  industry: z.string().max(200).optional().nullable(),
  company_id: z.string().optional().nullable(),
  company_name: z.string().max(300).optional().nullable(),
  company_logo_url: z.string().url().max(500).optional().nullable(),
  company_about: z.string().optional().nullable(),
  company_size: z.string().max(100).optional().nullable(),
  followers_count: z.number().int().nonnegative().optional().nullable(),
  skills_required: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  promoted: z.boolean().optional(),
  easy_apply: z.boolean().optional(),
});

// Pytest uses a minimal payload (only recruiter_id + title + description required).
const CreatePytestSchema = z.object({
  recruiter_id: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  employment_type: z.enum(EMPLOYMENT).optional(),
  location: z.string().max(255).optional().nullable(),
  remote_type: z.enum(REMOTE).optional(),
  salary_range: z.string().max(100).optional().nullable(),
});

const CreateSchema = z.union([CreateProfessorSchema, CreateFrontendSchema, CreatePytestSchema]);

// ── REST compatibility: recruiters + jobs ──────────────────────────────────────
// The professor doc specifies POST-only RPC endpoints (/jobs/*). The project test
// suite also calls RESTful endpoints. We support both without changing the
// underlying storage.

const CreateRecruiterSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional().nullable(),
  company_name: z.string().min(1).max(300),
  company_industry: z.string().max(200).optional().nullable(),
  company_size: z.string().max(100).optional().nullable(),
});

jobsRouter.post('/recruiters', async (req, res, next) => {
  try {
    const body = validate(CreateRecruiterSchema, req.body);
    const pool = getPool();
    const recruiter_id = uuidv4();
    const company_id = uuidv4();

    try {
      await pool.query(
        `INSERT INTO recruiters
           (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size)
         VALUES
           (:recruiter_id, :company_id, :name, :email, :phone, :company_name, :company_industry, :company_size)`,
        {
          recruiter_id,
          company_id,
          ...body,
          phone: body.phone ?? null,
          company_industry: body.company_industry ?? null,
          company_size: body.company_size ?? null,
        },
      );
    } catch (err) {
      // mysql2: ER_DUP_ENTRY
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'DUPLICATE_EMAIL', 'email already exists', { field: 'email' });
      }
      throw err;
    }

    return res.status(201).json(ok({ recruiter_id, company_id, ...body }, req.traceId));
  } catch (err) {
    next(err);
  }
});

// POST /jobs (pytest)
jobsRouter.post('/jobs', async (req, res, next) => {
  try {
    const body = validate(CreateSchema, req.body);
    const pool = getPool();
    const jobId = uuidv4();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [recRows] = await conn.query(
        'SELECT recruiter_id, company_id FROM recruiters WHERE recruiter_id = :recruiter_id LIMIT 1',
        { recruiter_id: body.recruiter_id },
      );
      if (recRows.length === 0) throw new ApiError(404, 'RECRUITER_NOT_FOUND', `Recruiter ${body.recruiter_id} not found`);
      const recruiterCompanyId = recRows[0].company_id;

      const company_id = 'company_id' in body && body.company_id ? body.company_id : recruiterCompanyId;
      const remote_type = 'work_mode' in body && body.work_mode ? body.work_mode : body.remote_type;
      const skills_required = Array.isArray(body.skills_required)
        ? body.skills_required
        : Array.isArray(body.skills)
          ? body.skills
          : [];

      await conn.query(
        `INSERT INTO jobs
           (job_id, company_id, recruiter_id, title, description,
            seniority_level, employment_type, location, remote_type, salary_range, status)
         VALUES
           (:job_id, :company_id, :recruiter_id, :title, :description,
            :seniority_level, :employment_type, :location, :remote_type, :salary_range, :status)`,
        {
          job_id: jobId,
          company_id,
          recruiter_id: body.recruiter_id,
          title: body.title,
          description: body.description,
          seniority_level: ('seniority_level' in body ? body.seniority_level : null) || null,
          employment_type: body.employment_type || null,
          location: body.location || null,
          remote_type,
          salary_range: ('salary_range' in body ? body.salary_range : null) || null,
          status: ('status' in body ? body.status : 'open') || 'open',
        },
      );

      if (skills_required.length) {
        const values = skills_required.map((s) => [jobId, s]);
        await conn.query('INSERT IGNORE INTO job_skills (job_id, skill) VALUES ?', [values]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await invalidatePrefix('job:search:');

    return res.status(201).json(ok({ job_id: jobId, status: body.status ?? 'open', ...body }, req.traceId));
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/create', async (req, res, next) => {
  try {
    const body = validate(CreateSchema, req.body);
    const pool = getPool();
    const jobId = uuidv4();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [recRows] = await conn.query(
        'SELECT recruiter_id, company_id FROM recruiters WHERE recruiter_id = :recruiter_id LIMIT 1',
        { recruiter_id: body.recruiter_id },
      );
      if (recRows.length === 0) throw new ApiError(404, 'RECRUITER_NOT_FOUND', `Recruiter ${body.recruiter_id} not found`);
      const recruiterCompanyId = recRows[0].company_id;

      const company_id = 'company_id' in body && body.company_id ? body.company_id : recruiterCompanyId;
      const remote_type = 'work_mode' in body && body.work_mode ? body.work_mode : body.remote_type;
      const skills_required = Array.isArray(body.skills_required)
        ? body.skills_required
        : Array.isArray(body.skills)
          ? body.skills
          : [];

      await conn.query(
        `INSERT INTO jobs
           (job_id, company_id, recruiter_id, title, description,
            seniority_level, employment_type, location, remote_type, salary_range, status)
         VALUES
           (:job_id, :company_id, :recruiter_id, :title, :description,
            :seniority_level, :employment_type, :location, :remote_type, :salary_range, :status)`,
        {
          job_id: jobId,
          company_id,
          recruiter_id: body.recruiter_id,
          title: body.title,
          description: body.description,
          seniority_level: ('seniority_level' in body ? body.seniority_level : null) || null,
          employment_type: body.employment_type || null,
          location: body.location || null,
          remote_type,
          salary_range: ('salary_range' in body ? body.salary_range : null) || null,
          status: ('status' in body ? body.status : 'open') || 'open',
        },
      );

      if (skills_required.length) {
        const values = skills_required.map((s) => [jobId, s]);
        await conn.query('INSERT IGNORE INTO job_skills (job_id, skill) VALUES ?', [values]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await invalidatePrefix('job:search:');

    return res.status(201).json(ok({ job_id: jobId, ...body }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const GetSchema = z.object({ job_id: z.string().min(1) });

jobsRouter.post('/jobs/get', async (req, res, next) => {
  try {
    const { job_id } = validate(GetSchema, req.body);
    const key = keys.job(job_id);

    const data = await getOrSet(key, config.CACHE_TTL_ENTITY_SEC, async () => {
      return fetchJob(job_id);
    });

    if (!data) throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);

    // views_count bump is a write path that would normally go through the
    // real Job Service + Kafka job.viewed event. We expose an explicit endpoint
    // used by the frontend to avoid double counting.
    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/incrementViews', async (req, res, next) => {
  try {
    const { job_id } = validate(GetSchema, req.body);
    const [result] = await getPool().query(
      'UPDATE jobs SET views_count = views_count + 1 WHERE job_id = :job_id',
      { job_id },
    );
    if (result.affectedRows === 0) throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);
    await invalidate(keys.job(job_id));
    return res.json(ok({ success: true }, req.traceId));
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/jobs/incrementApplicants', async (req, res, next) => {
  try {
    const { job_id } = validate(GetSchema, req.body);
    // Idempotent recompute from source-of-truth (applications).
    const [[{ total }]] = await getPool().query(
      'SELECT COUNT(*) AS total FROM applications WHERE job_id = :job_id',
      { job_id },
    );
    const [result] = await getPool().query(
      'UPDATE jobs SET applicants_count = :total WHERE job_id = :job_id',
      { job_id, total: Number(total) },
    );
    if (result.affectedRows === 0) throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);
    await invalidate(keys.job(job_id));
    return res.json(ok({ success: true }, req.traceId));
  } catch (err) {
    next(err);
  }
});

jobsRouter.post('/companies/incrementViews', async (req, res, next) => {
  try {
    const Body = z.object({ company_name: z.string().min(1).max(300) });
    validate(Body, req.body);
    // No-op for now; company view counters are not persisted.
    return res.json(ok({ success: true }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const UpdateSchema = z.object({
  job_id: z.string().min(1),
  title: z.string().min(1).max(300).optional(),
  description: z.string().min(1).optional(),
  seniority_level: z.enum(SENIORITY).optional(),
  employment_type: z.enum(EMPLOYMENT).optional(),
  location: z.string().max(255).nullable().optional(),
  remote_type: z.enum(REMOTE).optional(),
  salary_range: z.string().max(100).nullable().optional(),
});

jobsRouter.post('/jobs/update', async (req, res, next) => {
  try {
    const { job_id, ...fields } = validate(UpdateSchema, req.body);
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields provided');
    }
    const setClause = entries.map(([k]) => `${k} = :${k}`).join(', ');
    const params = { job_id, ...Object.fromEntries(entries) };

    const [result] = await getPool().query(
      `UPDATE jobs SET ${setClause} WHERE job_id = :job_id`,
      params,
    );
    if (result.affectedRows === 0) {
      throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);
    }

    await invalidate(keys.job(job_id));
    await invalidatePrefix('job:search:');

    return res.json(ok({ job_id, updated: true, fields: Object.keys(fields) }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const CloseSchema = z.object({ job_id: z.string().min(1) });

jobsRouter.post('/jobs/close', async (req, res, next) => {
  try {
    const { job_id } = validate(CloseSchema, req.body);
    const pool = getPool();

    const [[existing]] = await pool.query(
      'SELECT status FROM jobs WHERE job_id = :job_id LIMIT 1',
      { job_id },
    );
    if (!existing) throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);
    if (existing.status === 'closed') {
      throw new ApiError(409, 'ALREADY_CLOSED', `Job ${job_id} is already closed`);
    }

    await pool.query("UPDATE jobs SET status = 'closed' WHERE job_id = :job_id", { job_id });

    await invalidate(keys.job(job_id));
    await invalidatePrefix('job:search:');

    return res.json(ok({ job_id, status: 'closed' }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const SearchSchema = z.object({
  keyword: z.string().optional(),
  location: z.string().optional(),
  // Frontend uses `type` (string) + `remote` (boolean). Accept both and map.
  employment_type: z.enum(EMPLOYMENT).optional(),
  type: z.string().optional(),
  remote_type: z.enum(REMOTE).optional(),
  remote: z.boolean().optional(),
  industry: z.string().optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(100).default(20),
  pageSize: z.number().int().positive().max(100).optional(),
});

jobsRouter.post('/jobs/search', async (req, res, next) => {
  try {
    const filters = validate(SearchSchema, req.body);
    const page_size = filters.pageSize ?? filters.page_size;
    const key = keys.jobSearch(filters);

    const data = await getOrSet(key, config.CACHE_TTL_SEARCH_SEC, async () => {
      const pool = getPool();
      const offset = (filters.page - 1) * page_size;
      const where = ["j.status = 'open'"];
      const params = { page_size, offset };

      if (filters.keyword) {
        where.push('MATCH(title, description, location) AGAINST (:kw IN NATURAL LANGUAGE MODE)');
        params.kw = filters.keyword;
      }
      if (filters.location) {
        where.push('j.location LIKE :loc');
        params.loc = `%${filters.location}%`;
      }
      const employment = filters.employment_type || (filters.type ? filters.type : undefined);
      if (employment && EMPLOYMENT.includes(employment)) {
        where.push('j.employment_type = :employment_type');
        params.employment_type = employment;
      }
      const remoteType = filters.remote_type || (filters.remote ? 'remote' : undefined);
      if (remoteType && REMOTE.includes(remoteType)) {
        where.push('j.remote_type = :remote_type');
        params.remote_type = remoteType;
      }
      if (filters.industry) {
        where.push('r.company_industry LIKE :industry');
        params.industry = `%${filters.industry}%`;
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const [rows] = await pool.query(
        `SELECT j.job_id, j.title, j.location, j.remote_type, j.employment_type,
                j.salary_range, j.posted_datetime, j.applicants_count, j.views_count,
                r.company_name,
                COUNT(js.skill) AS skill_count
           FROM jobs j
           LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
           LEFT JOIN job_skills js ON js.job_id = j.job_id
           ${whereSql}
           GROUP BY j.job_id, j.title, j.location, j.remote_type, j.employment_type,
                    j.salary_range, j.posted_datetime, j.applicants_count, j.views_count, r.company_name
           ORDER BY skill_count DESC, j.posted_datetime DESC
           LIMIT :page_size OFFSET :offset`,
        params,
      );
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM jobs j ${whereSql}`,
        params,
      );
      return { results: rows, total: Number(total), page: filters.page, page_size: filters.page_size };
    });

    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});

const ByRecruiterSchema = z.object({
  recruiter_id: z.string().min(1),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(100).default(20),
});

jobsRouter.post('/jobs/byRecruiter', async (req, res, next) => {
  try {
    const { recruiter_id, page, page_size } = validate(ByRecruiterSchema, req.body);
    const pool = getPool();
    const offset = (page - 1) * page_size;

    const [rows] = await pool.query(
      `SELECT job_id, title, status, applicants_count, views_count, posted_datetime
         FROM jobs
        WHERE recruiter_id = :recruiter_id
        ORDER BY posted_datetime DESC
        LIMIT :page_size OFFSET :offset`,
      { recruiter_id, page_size, offset },
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM jobs WHERE recruiter_id = :recruiter_id',
      { recruiter_id },
    );

    return res.json(ok({ results: rows, total: Number(total), page, page_size }, req.traceId));
  } catch (err) {
    next(err);
  }
});

// GET /jobs/search (pytest)
jobsRouter.get('/jobs/search', async (req, res, next) => {
  try {
    const raw = {
      keyword: typeof req.query?.q === 'string' ? req.query.q : undefined,
      location: typeof req.query?.location === 'string' ? req.query.location : undefined,
      employment_type: typeof req.query?.employment_type === 'string' ? req.query.employment_type : undefined,
      remote_type: typeof req.query?.remote_type === 'string' ? req.query.remote_type : undefined,
      industry: typeof req.query?.industry === 'string' ? req.query.industry : undefined,
      page: req.query?.page ? Number(req.query.page) : 1,
      page_size: req.query?.limit ? Number(req.query.limit) : 20,
    };
    const filters = validate(SearchSchema, raw);
    const page_size = filters.pageSize ?? filters.page_size;
    const key = keys.jobSearch(filters);

    const data = await getOrSet(key, config.CACHE_TTL_SEARCH_SEC, async () => {
      const pool = getPool();
      const offset = (filters.page - 1) * page_size;
      const where = ["j.status = 'open'"];
      const params = { page_size, offset };

      if (filters.keyword) {
        where.push('MATCH(title, description, location) AGAINST (:kw IN NATURAL LANGUAGE MODE)');
        params.kw = filters.keyword;
      }
      if (filters.location) {
        where.push('j.location LIKE :loc');
        params.loc = `%${filters.location}%`;
      }
      if (filters.employment_type && EMPLOYMENT.includes(filters.employment_type)) {
        where.push('j.employment_type = :employment_type');
        params.employment_type = filters.employment_type;
      }
      if (filters.remote_type && REMOTE.includes(filters.remote_type)) {
        where.push('j.remote_type = :remote_type');
        params.remote_type = filters.remote_type;
      }
      if (filters.industry) {
        where.push('r.company_industry LIKE :industry');
        params.industry = `%${filters.industry}%`;
      }
      const whereSql = `WHERE ${where.join(' AND ')}`;

      const [rows] = await pool.query(
        `SELECT j.job_id, j.title, j.location, j.remote_type, j.employment_type,
                j.salary_range, j.posted_datetime, j.applicants_count, j.views_count,
                r.company_name
           FROM jobs j
           LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
           ${whereSql}
           ORDER BY j.posted_datetime DESC
           LIMIT :page_size OFFSET :offset`,
        params,
      );
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM jobs j LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id ${whereSql}`,
        params,
      );
      return { items: rows, total: Number(total), page: filters.page, limit: page_size };
    });

    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});

// GET /jobs/:job_id (pytest)
jobsRouter.get('/jobs/:job_id', async (req, res, next) => {
  try {
    const job_id = req.params.job_id;
    if (!job_id) throw new ApiError(400, 'VALIDATION_ERROR', 'job_id is required');
    const key = keys.job(job_id);
    const data = await getOrSet(key, config.CACHE_TTL_ENTITY_SEC, async () => fetchJob(job_id));
    if (!data) throw new ApiError(404, 'NOT_FOUND', `Job ${job_id} not found`);
    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});

// PUT /jobs/:job_id (pytest)
jobsRouter.put('/jobs/:job_id', async (req, res, next) => {
  try {
    const job_id = req.params.job_id;
    const body = validate(UpdateSchema, { ...req.body, job_id });
    const { job_id: _ignored, ...fields } = body;
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields provided');
    }
    const setClause = entries.map(([k]) => `${k} = :${k}`).join(', ');
    const params = { job_id, ...Object.fromEntries(entries) };

    const [result] = await getPool().query(`UPDATE jobs SET ${setClause} WHERE job_id = :job_id`, params);
    if (result.affectedRows === 0) {
      throw new ApiError(404, 'NOT_FOUND', `Job ${job_id} not found`);
    }

    await invalidate(keys.job(job_id));
    await invalidatePrefix('job:search:');

    const updated = await fetchJob(job_id);
    return res.json(ok(updated, req.traceId));
  } catch (err) {
    next(err);
  }
});

// PATCH /jobs/:job_id/close (pytest)
jobsRouter.patch('/jobs/:job_id/close', async (req, res, next) => {
  try {
    const job_id = req.params.job_id;
    const pool = getPool();

    const [[existing]] = await pool.query('SELECT status FROM jobs WHERE job_id = :job_id LIMIT 1', { job_id });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', `Job ${job_id} not found`);
    if (existing.status === 'closed') {
      throw new ApiError(409, 'ALREADY_CLOSED', `Job ${job_id} is already closed`);
    }

    await pool.query("UPDATE jobs SET status = 'closed' WHERE job_id = :job_id", { job_id });
    await invalidate(keys.job(job_id));
    await invalidatePrefix('job:search:');

    return res.json(ok({ job_id, status: 'closed' }, req.traceId));
  } catch (err) {
    next(err);
  }
});

// GET /jobs?recruiter_id=... (pytest)
jobsRouter.get('/jobs', async (req, res, next) => {
  try {
    const recruiter_id = typeof req.query?.recruiter_id === 'string' ? req.query.recruiter_id : null;
    if (!recruiter_id) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'recruiter_id query param is required');
    }
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT job_id, title, status, applicants_count, views_count, posted_datetime
         FROM jobs
        WHERE recruiter_id = :recruiter_id
        ORDER BY posted_datetime DESC`,
      { recruiter_id },
    );
    return res.json(ok({ items: rows }, req.traceId));
  } catch (err) {
    next(err);
  }
});
