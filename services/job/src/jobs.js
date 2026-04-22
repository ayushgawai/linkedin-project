import crypto from 'node:crypto';
import { pool } from '../../shared/db.js';
import { successResponse, errorResponse } from '../../shared/response.js';

const DUPLICATE = 'ER_DUP_ENTRY';

function err(res, status, code, message, details = {}) {
  return res.status(status).json(errorResponse(code, message, details));
}

function ok(res, data, status = 200) {
  return res.status(status).json(successResponse(data));
}

const VALID_SENIORITY = new Set([
  'internship', 'entry', 'associate', 'mid', 'senior', 'director', 'executive',
]);
const VALID_EMPLOYMENT = new Set([
  'full_time', 'part_time', 'contract', 'temporary', 'volunteer', 'internship',
]);
const VALID_REMOTE = new Set(['onsite', 'remote', 'hybrid']);

function mapJobRow(row) {
  return {
    job_id: row.job_id,
    company_id: row.company_id,
    recruiter_id: row.recruiter_id,
    title: row.title,
    description: row.description,
    seniority_level: row.seniority_level,
    employment_type: row.employment_type,
    location: row.location,
    remote_type: row.remote_type,
    salary_range: row.salary_range,
    status: row.status,
    posted_datetime: row.posted_datetime,
    views_count: row.views_count,
    applicants_count: row.applicants_count,
  };
}

async function loadJobWithSkills(jobId) {
  const [rows] = await pool.execute(
    `SELECT * FROM jobs WHERE job_id = ?`, [jobId],
  );
  if (!rows.length) return null;
  const job = mapJobRow(rows[0]);
  const [skills] = await pool.query(
    'SELECT skill FROM job_skills WHERE job_id = ? ORDER BY skill', [jobId],
  );
  job.skills_required = skills.map((r) => r.skill);
  return job;
}

export async function createJob(req, res) {
  const b = req.body || {};
  const errors = new Map();

  if (!b.title || String(b.title).trim() === '') errors.set('title', 'required');
  if (!b.description || String(b.description).trim() === '') errors.set('description', 'required');
  if (!b.company_id || String(b.company_id).trim() === '') errors.set('company_id', 'required');
  if (!b.recruiter_id || String(b.recruiter_id).trim() === '') errors.set('recruiter_id', 'required');
  if (b.seniority_level && !VALID_SENIORITY.has(b.seniority_level))
    errors.set('seniority_level', `must be one of: ${[...VALID_SENIORITY].join(', ')}`);
  if (b.employment_type && !VALID_EMPLOYMENT.has(b.employment_type))
    errors.set('employment_type', `must be one of: ${[...VALID_EMPLOYMENT].join(', ')}`);
  if (b.remote_type && !VALID_REMOTE.has(b.remote_type))
    errors.set('remote_type', `must be one of: ${[...VALID_REMOTE].join(', ')}`);

  if (errors.size) {
    return err(res, 400, 'VALIDATION_ERROR', 'Invalid input', { fields: Object.fromEntries(errors) });
  }

  const recruiterId = String(b.recruiter_id).trim();
  const [recRows] = await pool.execute(
    'SELECT 1 FROM recruiters WHERE recruiter_id = ? LIMIT 1', [recruiterId],
  );
  if (!recRows.length) {
    return err(res, 404, 'RECRUITER_NOT_FOUND', 'No recruiter with this id', { recruiter_id: recruiterId });
  }

  const jobId = crypto.randomUUID();
  const skills = Array.isArray(b.skills_required)
    ? b.skills_required.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO jobs (job_id, company_id, recruiter_id, title, description,
        seniority_level, employment_type, location, remote_type, salary_range, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId,
        String(b.company_id).trim(),
        recruiterId,
        String(b.title).trim(),
        String(b.description).trim(),
        b.seniority_level || null,
        b.employment_type || null,
        b.location || null,
        b.remote_type || 'onsite',
        b.salary_range || null,
        b.status || 'open',
      ],
    );
    for (const s of skills) {
      await conn.execute('INSERT INTO job_skills (job_id, skill) VALUES (?, ?)', [jobId, s]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to create job');
  } finally {
    conn.release();
  }

  const created = await loadJobWithSkills(jobId);
  return ok(res, created, 201);
}

export async function getJob(req, res) {
  const { job_id } = req.body || {};
  if (!job_id || String(job_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');
  }
  const id = String(job_id).trim();

  // Increment views_count per the contract (§4.2: views_count increments on each get)
  await pool.execute('UPDATE jobs SET views_count = views_count + 1 WHERE job_id = ?', [id]);

  const job = await loadJobWithSkills(id);
  if (!job) return err(res, 404, 'JOB_NOT_FOUND', 'No job with this id', { job_id: id });
  return ok(res, job);
}

export async function updateJob(req, res) {
  const b = req.body || {};
  const job_id = b.job_id;
  if (!job_id || String(job_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');
  }
  const id = String(job_id).trim();
  const [exists] = await pool.execute('SELECT 1 FROM jobs WHERE job_id = ? LIMIT 1', [id]);
  if (!exists.length) {
    return err(res, 404, 'JOB_NOT_FOUND', 'No job with this id', { job_id: id });
  }

  const ALLOWED = new Set([
    'title', 'description', 'seniority_level', 'employment_type',
    'location', 'remote_type', 'salary_range',
  ]);
  const fields = b.fields_to_update && typeof b.fields_to_update === 'object' ? b.fields_to_update : b;
  const sets = [];
  const values = [];
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`\`${key}\` = ?`);
      values.push(fields[key] == null ? null : String(fields[key]));
    }
  }
  const hasSkills = Object.prototype.hasOwnProperty.call(b, 'skills_required') && Array.isArray(b.skills_required);
  if (!sets.length && !hasSkills) {
    return err(res, 400, 'VALIDATION_ERROR', 'No updatable fields provided');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (sets.length) {
      values.push(id);
      await conn.execute(`UPDATE jobs SET ${sets.join(', ')} WHERE job_id = ?`, values);
    }
    if (hasSkills) {
      await conn.execute('DELETE FROM job_skills WHERE job_id = ?', [id]);
      for (const s of b.skills_required) {
        const t = String(s).trim();
        if (t) await conn.execute('INSERT INTO job_skills (job_id, skill) VALUES (?, ?)', [id, t]);
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to update job');
  } finally {
    conn.release();
  }

  const updated = await loadJobWithSkills(id);
  return ok(res, updated);
}

function escapeLike(s) {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function searchJobs(req, res) {
  const b = req.body || {};
  const page = Math.max(1, parseInt(String(b.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(b.page_size), 10) || 20));
  const keyword = b.keyword ? String(b.keyword).trim() : null;
  const location = b.location ? String(b.location).trim() : null;
  const employmentType = b.employment_type || null;
  const remoteType = b.remote_type || null;

  const cond = ['j.status = ?'];
  const params = ['open'];

  if (keyword) {
    const k = `%${escapeLike(keyword)}%`;
    cond.push('(j.title LIKE ? OR j.description LIKE ?)');
    params.push(k, k);
  }
  if (location) {
    cond.push('IFNULL(j.location, "") LIKE ?');
    params.push(`%${escapeLike(location)}%`);
  }
  if (employmentType) {
    cond.push('j.employment_type = ?');
    params.push(employmentType);
  }
  if (remoteType) {
    cond.push('j.remote_type = ?');
    params.push(remoteType);
  }

  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS c FROM jobs j ${whereSql}`, params,
  );
  const total = countRows[0].c;

  const [rows] = await pool.query(
    `SELECT j.* FROM jobs j ${whereSql} ORDER BY j.posted_datetime DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  const results = [];
  for (const row of rows) {
    const job = mapJobRow(row);
    const [skills] = await pool.query(
      'SELECT skill FROM job_skills WHERE job_id = ? ORDER BY skill', [row.job_id],
    );
    job.skills_required = skills.map((r) => r.skill);
    results.push(job);
  }
  return ok(res, { results, total, page, page_size: pageSize });
}

export async function closeJob(req, res) {
  const { job_id } = req.body || {};
  if (!job_id || String(job_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');
  }
  const id = String(job_id).trim();
  const [rows] = await pool.execute('SELECT status FROM jobs WHERE job_id = ?', [id]);
  if (!rows.length) {
    return err(res, 404, 'JOB_NOT_FOUND', 'No job with this id', { job_id: id });
  }
  if (rows[0].status === 'closed') {
    return err(res, 409, 'ALREADY_CLOSED', 'Job is already closed', { job_id: id });
  }
  await pool.execute("UPDATE jobs SET status = 'closed' WHERE job_id = ?", [id]);
  return ok(res, { job_id: id, status: 'closed' });
}

export async function byRecruiter(req, res) {
  const b = req.body || {};
  const { recruiter_id } = b;
  if (!recruiter_id || String(recruiter_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'recruiter_id is required');
  }
  const rid = String(recruiter_id).trim();
  const page = Math.max(1, parseInt(String(b.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(b.page_size), 10) || 20));
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS c FROM jobs WHERE recruiter_id = ?', [rid],
  );
  const total = countRows[0].c;

  const [rows] = await pool.query(
    'SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY posted_datetime DESC LIMIT ? OFFSET ?',
    [rid, pageSize, offset],
  );
  const results = [];
  for (const row of rows) {
    const job = mapJobRow(row);
    const [skills] = await pool.query(
      'SELECT skill FROM job_skills WHERE job_id = ? ORDER BY skill', [row.job_id],
    );
    job.skills_required = skills.map((r) => r.skill);
    results.push(job);
  }
  return ok(res, { results, total, page, page_size: pageSize });
}
