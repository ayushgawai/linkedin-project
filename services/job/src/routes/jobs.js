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

const CreateSchema = z.object({
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

jobsRouter.post('/jobs/create', async (req, res, next) => {
  try {
    const body = validate(CreateSchema, req.body);
    const pool = getPool();
    const jobId = uuidv4();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [recRows] = await conn.query(
        'SELECT recruiter_id FROM recruiters WHERE recruiter_id = :recruiter_id LIMIT 1',
        { recruiter_id: body.recruiter_id },
      );
      if (recRows.length === 0) {
        await conn.rollback();
        throw new ApiError(404, 'RECRUITER_NOT_FOUND', `Recruiter ${body.recruiter_id} not found`);
      }

      await conn.query(
        `INSERT INTO jobs
           (job_id, company_id, recruiter_id, title, description,
            seniority_level, employment_type, location, remote_type, salary_range, status)
         VALUES
           (:job_id, :company_id, :recruiter_id, :title, :description,
            :seniority_level, :employment_type, :location, :remote_type, :salary_range, :status)`,
        {
          job_id: jobId,
          company_id: body.company_id,
          recruiter_id: body.recruiter_id,
          title: body.title,
          description: body.description,
          seniority_level: body.seniority_level || null,
          employment_type: body.employment_type || null,
          location: body.location || null,
          remote_type: body.remote_type,
          salary_range: body.salary_range || null,
          status: body.status,
        },
      );

      if (body.skills_required.length) {
        const values = body.skills_required.map((s) => [jobId, s]);
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
      const [skills] = await pool.query(
        'SELECT skill FROM job_skills WHERE job_id = :job_id',
        { job_id },
      );
      return { ...rows[0], skills_required: skills.map((s) => s.skill) };
    });

    if (!data) throw new ApiError(404, 'JOB_NOT_FOUND', `Job ${job_id} not found`);

    // views_count bump is a write path that would normally go through the
    // real Job Service + Kafka job.viewed event. We keep the stub read-only
    // for now — Ayush's implementation owns that increment.
    return res.json(ok(data, req.traceId));
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
  employment_type: z.enum(EMPLOYMENT).optional(),
  remote_type: z.enum(REMOTE).optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(100).default(20),
});

jobsRouter.post('/jobs/search', async (req, res, next) => {
  try {
    const filters = validate(SearchSchema, req.body);
    const key = keys.jobSearch(filters);

    const data = await getOrSet(key, config.CACHE_TTL_SEARCH_SEC, async () => {
      const pool = getPool();
      const offset = (filters.page - 1) * filters.page_size;
      const where = ["j.status = 'open'"];
      const params = { page_size: filters.page_size, offset };

      if (filters.keyword) {
        where.push('MATCH(title, description, location) AGAINST (:kw IN NATURAL LANGUAGE MODE)');
        params.kw = filters.keyword;
      }
      if (filters.location) {
        where.push('j.location LIKE :loc');
        params.loc = `%${filters.location}%`;
      }
      if (filters.employment_type) {
        where.push('j.employment_type = :employment_type');
        params.employment_type = filters.employment_type;
      }
      if (filters.remote_type) {
        where.push('j.remote_type = :remote_type');
        params.remote_type = filters.remote_type;
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
