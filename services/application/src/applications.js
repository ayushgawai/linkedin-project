import crypto from 'node:crypto';
import { pool } from '../../shared/db.js';
import { buildEnvelope } from '../../shared/kafka.js';
import { publishOrOutbox } from '../../shared/outbox.js';
import { successResponse, errorResponse } from '../../shared/response.js';

const DUPLICATE = 'ER_DUP_ENTRY';

function err(res, status, code, message, details = {}) {
  return res.status(status).json(errorResponse(code, message, details));
}

function ok(res, data, status = 200) {
  return res.status(status).json(successResponse(data));
}

// Valid state-machine transitions for application status
const VALID_TRANSITIONS = {
  submitted: new Set(['reviewing']),
  reviewing: new Set(['interview', 'rejected']),
  interview: new Set(['offer', 'rejected']),
  offer: new Set([]),
  rejected: new Set([]),
};

function mapAppRow(row) {
  return {
    application_id: row.application_id,
    job_id: row.job_id,
    member_id: row.member_id,
    resume_url: row.resume_url,
    resume_text: row.resume_text,
    cover_letter: row.cover_letter,
    application_datetime: row.application_datetime,
    status: row.status,
  };
}

export async function submit(req, res) {
  const b = req.body || {};
  const errors = new Map();

  if (!b.job_id || String(b.job_id).trim() === '') errors.set('job_id', 'required');
  if (!b.member_id || String(b.member_id).trim() === '') errors.set('member_id', 'required');
  if (errors.size) {
    return err(res, 400, 'VALIDATION_ERROR', 'Invalid input', { fields: Object.fromEntries(errors) });
  }

  const jobId = String(b.job_id).trim();
  const memberId = String(b.member_id).trim();

  const [jobRows] = await pool.execute('SELECT status FROM jobs WHERE job_id = ?', [jobId]);
  if (!jobRows.length) {
    return err(res, 404, 'JOB_NOT_FOUND', 'No job with this id', { job_id: jobId });
  }
  if (jobRows[0].status === 'closed') {
    return err(res, 409, 'JOB_CLOSED', 'This job is no longer accepting applications', { job_id: jobId });
  }

  const [memberRows] = await pool.execute('SELECT 1 FROM members WHERE member_id = ? LIMIT 1', [memberId]);
  if (!memberRows.length) {
    return err(res, 404, 'MEMBER_NOT_FOUND', 'No member with this id', { member_id: memberId });
  }

  const applicationId = crypto.randomUUID();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO applications (application_id, job_id, member_id, resume_url, resume_text, cover_letter)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        jobId,
        memberId,
        b.resume_url || null,
        b.resume_text || null,
        b.cover_letter || null,
      ],
    );
    await conn.execute(
      'UPDATE jobs SET applicants_count = applicants_count + 1 WHERE job_id = ?', [jobId],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e.code === DUPLICATE) {
      return err(res, 409, 'DUPLICATE_APPLICATION', 'Already applied to this job', {
        job_id: jobId, member_id: memberId,
      });
    }
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to submit application');
  } finally {
    conn.release();
  }

  publishOrOutbox('application.submitted', buildEnvelope({
    eventType: 'application.submitted',
    actorId: memberId,
    entityType: 'application',
    entityId: applicationId,
    payload: { application_id: applicationId, job_id: jobId, member_id: memberId },
  })).catch(() => {});

  return ok(res, { application_id: applicationId }, 201);
}

export async function get(req, res) {
  const { application_id } = req.body || {};
  if (!application_id || String(application_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'application_id is required');
  }
  const id = String(application_id).trim();
  const [rows] = await pool.execute('SELECT * FROM applications WHERE application_id = ?', [id]);
  if (!rows.length) {
    return err(res, 404, 'NOT_FOUND', 'Application not found', { application_id: id });
  }
  return ok(res, mapAppRow(rows[0]));
}

export async function byJob(req, res) {
  const b = req.body || {};
  const { job_id } = b;
  if (!job_id || String(job_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'job_id is required');
  }
  const jid = String(job_id).trim();
  const page = Math.max(1, parseInt(String(b.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(b.page_size), 10) || 20));
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS c FROM applications WHERE job_id = ?', [jid],
  );
  const total = countRows[0].c;

  const [rows] = await pool.query(
    'SELECT * FROM applications WHERE job_id = ? ORDER BY application_datetime DESC LIMIT ? OFFSET ?',
    [jid, pageSize, offset],
  );
  return ok(res, { results: rows.map(mapAppRow), total, page, page_size: pageSize });
}

export async function byMember(req, res) {
  const b = req.body || {};
  const { member_id } = b;
  if (!member_id || String(member_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'member_id is required');
  }
  const mid = String(member_id).trim();
  const page = Math.max(1, parseInt(String(b.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(b.page_size), 10) || 20));
  const offset = (page - 1) * pageSize;

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS c FROM applications WHERE member_id = ?', [mid],
  );
  const total = countRows[0].c;

  const [rows] = await pool.query(
    'SELECT * FROM applications WHERE member_id = ? ORDER BY application_datetime DESC LIMIT ? OFFSET ?',
    [mid, pageSize, offset],
  );
  return ok(res, { results: rows.map(mapAppRow), total, page, page_size: pageSize });
}

export async function updateStatus(req, res) {
  const b = req.body || {};
  const { application_id, status: newStatus, note } = b;
  if (!application_id || String(application_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'application_id is required');
  }
  if (!newStatus) {
    return err(res, 400, 'VALIDATION_ERROR', 'status is required');
  }

  const id = String(application_id).trim();
  const [rows] = await pool.execute(
    'SELECT status FROM applications WHERE application_id = ?', [id],
  );
  if (!rows.length) {
    return err(res, 404, 'NOT_FOUND', 'Application not found', { application_id: id });
  }

  const currentStatus = rows[0].status;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(newStatus)) {
    return err(res, 400, 'INVALID_STATUS_TRANSITION', `Cannot transition from '${currentStatus}' to '${newStatus}'`, {
      current: currentStatus,
      requested: newStatus,
      allowed: allowed ? [...allowed] : [],
    });
  }

  await pool.execute(
    'UPDATE applications SET status = ? WHERE application_id = ?', [newStatus, id],
  );

  publishOrOutbox('application.status.updated', buildEnvelope({
    eventType: 'application.status.updated',
    actorId: b.recruiter_id || 'system',
    entityType: 'application',
    entityId: id,
    payload: { application_id: id, previous_status: currentStatus, new_status: newStatus },
  })).catch(() => {});

  return ok(res, { updated: true, application_id: id, status: newStatus });
}

export async function addNote(req, res) {
  const b = req.body || {};
  const { application_id, recruiter_id, note_text } = b;

  if (!application_id || String(application_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'application_id is required');
  }
  if (!recruiter_id || String(recruiter_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'recruiter_id is required');
  }
  if (!note_text || String(note_text).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'note_text is required');
  }

  const appId = String(application_id).trim();
  const [appRows] = await pool.execute(
    'SELECT 1 FROM applications WHERE application_id = ? LIMIT 1', [appId],
  );
  if (!appRows.length) {
    return err(res, 404, 'APPLICATION_NOT_FOUND', 'Application not found', { application_id: appId });
  }

  const noteId = crypto.randomUUID();
  await pool.execute(
    'INSERT INTO application_notes (note_id, application_id, recruiter_id, note_text) VALUES (?, ?, ?, ?)',
    [noteId, appId, String(recruiter_id).trim(), String(note_text).trim()],
  );

  return ok(res, { note_id: noteId });
}
