import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';

import { getPagination, sendError, sendSuccess } from '../../shared/src/http.js';
import { checkMySqlHealth, query, withTransaction } from '../../shared/src/mysql.js';
import { NotFoundError, ValidationError, optionalString, requireString } from '../../shared/src/validation.js';
import { publishOrOutbox } from '../../shared/src/outbox.js';
import { buildEnvelope, isKafkaConnected } from '../../shared/src/kafka.js';

const VALID_TRANSITIONS = {
  // Allow direct move to interview from submitted for demo UX.
  submitted: new Set(['reviewing', 'interview', 'rejected']),
  reviewing: new Set(['interview', 'rejected']),
  interview: new Set(['offer', 'rejected']),
  offer: new Set(['rejected']),
  rejected: new Set()
};
const VALID_APPLICATION_STATUSES = new Set(Object.keys(VALID_TRANSITIONS));

function validateSubmitPayload(body) {
  return {
    job_id: requireString(body.job_id, 'job_id'),
    member_id: requireString(body.member_id, 'member_id'),
    resume_url: optionalString(body.resume_url),
    resume_text: optionalString(body.resume_text),
    cover_letter: optionalString(body.cover_letter),
    answers: body.answers && typeof body.answers === 'object' ? body.answers : null
  };
}

async function hydrateApplication(applicationId, executor = query) {
  const [applicationRows] = await executor(
    `SELECT application_id, job_id, member_id, resume_url, resume_text, cover_letter,
            answers, application_datetime, status, status_note
       FROM applications
      WHERE application_id = ?`,
    [applicationId]
  );

  if (!applicationRows.length) {
    return null;
  }

  const [noteRows] = await executor(
    `SELECT note_id, application_id, recruiter_id, note_text, created_at
       FROM application_notes
      WHERE application_id = ?
   ORDER BY created_at DESC`,
    [applicationId]
  );

  return {
    ...applicationRows[0],
    notes: noteRows,
    answers: applicationRows[0].answers
      ? typeof applicationRows[0].answers === 'string'
        ? JSON.parse(applicationRows[0].answers)
        : applicationRows[0].answers
      : null
  };
}

export function createApplicationMySqlRepository() {
  return {
    async health() {
      return checkMySqlHealth();
    },

    async submit(input) {
      return withTransaction(async (connection) => {
        const [jobRows] = await connection.execute('SELECT job_id, status FROM jobs WHERE job_id = ?', [input.job_id]);
        if (!jobRows.length) {
          return { missing: 'JOB_NOT_FOUND' };
        }

        const [memberRows] = await connection.execute('SELECT member_id FROM members WHERE member_id = ?', [input.member_id]);
        if (!memberRows.length) {
          return { missing: 'MEMBER_NOT_FOUND' };
        }

        if (jobRows[0].status === 'closed') {
          return { conflict: 'JOB_CLOSED' };
        }

        const [dupeRows] = await connection.execute(
          'SELECT application_id FROM applications WHERE job_id = ? AND member_id = ?',
          [input.job_id, input.member_id]
        );

        if (dupeRows.length) {
          return { conflict: 'DUPLICATE_APPLICATION' };
        }

        const applicationId = randomUUID();
        await connection.execute(
          `INSERT INTO applications
            (application_id, job_id, member_id, resume_url, resume_text, cover_letter, answers, status, status_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', NULL)`,
          [
            applicationId,
            input.job_id,
            input.member_id,
            input.resume_url,
            input.resume_text,
            input.cover_letter,
            input.answers ? JSON.stringify(input.answers) : null
          ]
        );

        await connection.execute('UPDATE jobs SET applicants_count = applicants_count + 1 WHERE job_id = ?', [input.job_id]);
        return hydrateApplication(applicationId, connection.query.bind(connection));
      });
    },

    async getApplication(applicationId) {
      return hydrateApplication(applicationId);
    },

    async listByJob(jobId, page, pageSize) {
      const [[countRow]] = await query('SELECT COUNT(*) AS total FROM applications WHERE job_id = ?', [jobId]);
      const [rows] = await query(
        `SELECT application_id
           FROM applications
          WHERE job_id = ?
       ORDER BY application_datetime DESC
          LIMIT ? OFFSET ?`,
        [jobId, pageSize, (page - 1) * pageSize]
      );
      const results = await Promise.all(rows.map((row) => hydrateApplication(row.application_id)));
      return { results, total: countRow.total, page };
    },

    async listByMember(memberId, page, pageSize) {
      const [[countRow]] = await query('SELECT COUNT(*) AS total FROM applications WHERE member_id = ?', [memberId]);
      const [rows] = await query(
        `SELECT application_id
           FROM applications
          WHERE member_id = ?
       ORDER BY application_datetime DESC
          LIMIT ? OFFSET ?`,
        [memberId, pageSize, (page - 1) * pageSize]
      );
      const results = await Promise.all(rows.map((row) => hydrateApplication(row.application_id)));
      return { results, total: countRow.total, page };
    },

    async updateStatus(applicationId, status, note) {
      const application = await hydrateApplication(applicationId);
      if (!application) {
        return { notFound: true };
      }

      await query('UPDATE applications SET status = ?, status_note = ? WHERE application_id = ?', [status, note || null, applicationId]);
      return { updated: true };
    },

    async addNote(applicationId, recruiterId, noteText) {
      const application = await hydrateApplication(applicationId);
      if (!application) {
        return null;
      }

      const noteId = randomUUID();
      await query(
        'INSERT INTO application_notes (note_id, application_id, recruiter_id, note_text) VALUES (?, ?, ?, ?)',
        [noteId, applicationId, recruiterId, noteText]
      );
      return { note_id: noteId };
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

  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'unexpected server error');
}

export function createApplicationApp({ repository }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const db = await repository.health();
    const kafkaOk = isKafkaConnected();
    res.json({ status: db === 'connected' ? 'ok' : 'degraded', service: 'application', db, kafka: kafkaOk ? 'connected' : 'disconnected' });
  });

  // ── REST compatibility (pytest) ──────────────────────────────────────────────
  // The professor contract uses POST-only RPC endpoints under /applications/*.
  // The test suite calls REST endpoints. Support both by delegating to the same repository.

  app.post('/applications', async (req, res) => {
    try {
      const created = await repository.submit(validateSubmitPayload(req.body));
      if (created.missing) {
        return sendError(res, 404, created.missing, created.missing === 'JOB_NOT_FOUND' ? 'job was not found' : 'member was not found');
      }
      if (created.conflict) {
        return sendError(res, 409, created.conflict, created.conflict === 'JOB_CLOSED' ? 'job is closed' : 'member has already applied');
      }

      publishOrOutbox('application.submitted', buildEnvelope({
        eventType: 'application.submitted',
        actorId: req.body.member_id,
        entityType: 'application',
        entityId: created.application_id,
        payload: { application_id: created.application_id, job_id: req.body.job_id, member_id: req.body.member_id }
      })).catch(() => {});

      return sendSuccess(res, created, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.get('/applications/:application_id', async (req, res) => {
    try {
      const application = await repository.getApplication(requireString(req.params.application_id, 'application_id'));
      if (!application) {
        return sendError(res, 404, 'NOT_FOUND', 'application was not found');
      }
      return sendSuccess(res, application);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.get('/applications', async (req, res) => {
    try {
      const job_id = typeof req.query?.job_id === 'string' ? req.query.job_id : null;
      const member_id = typeof req.query?.member_id === 'string' ? req.query.member_id : null;

      const page = req.query?.page ? Number(req.query.page) : 1;
      const limit = req.query?.limit ? Number(req.query.limit) : 20;
      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;

      if (!job_id && !member_id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'job_id or member_id query param is required');
      }

      const result = job_id
        ? await repository.listByJob(job_id, safePage, safeLimit)
        : await repository.listByMember(member_id, safePage, safeLimit);

      return sendSuccess(res, { items: result.results || [], total: result.total ?? 0, page: result.page ?? safePage, limit: safeLimit });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.patch('/applications/:application_id/status', async (req, res) => {
    try {
      const applicationId = requireString(req.params.application_id, 'application_id');
      const status = requireString(req.body.status, 'status');
      const note = optionalString(req.body.note) || optionalString(req.body.rejection_reason);

      if (!VALID_APPLICATION_STATUSES.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'status must be a valid application status', {
          field: 'status',
          allowed: [...VALID_APPLICATION_STATUSES]
        });
      }

      const current = await repository.getApplication(applicationId);
      if (!current) {
        return sendError(res, 404, 'NOT_FOUND', 'application was not found');
      }

      if (!VALID_TRANSITIONS[current.status]?.has(status)) {
        return sendError(res, 400, 'INVALID_STATUS_TRANSITION', 'invalid application status transition', {
          from: current.status,
          to: status
        });
      }

      await repository.updateStatus(applicationId, status, note);

      publishOrOutbox('application.status.updated', buildEnvelope({
        eventType: 'application.status.updated',
        actorId: 'system',
        entityType: 'application',
        entityId: applicationId,
        payload: { application_id: applicationId, from: current.status, to: status }
      })).catch(() => {});

      const updated = await repository.getApplication(applicationId);
      return sendSuccess(res, updated);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/:application_id/notes', async (req, res) => {
    try {
      const applicationId = requireString(req.params.application_id, 'application_id');
      const recruiterId = requireString(req.body.recruiter_id, 'recruiter_id');
      const noteText = requireString(req.body.note_text, 'note_text');
      const note = await repository.addNote(applicationId, recruiterId, noteText);
      if (!note) {
        return sendError(res, 404, 'NOT_FOUND', 'application was not found');
      }
      return sendSuccess(res, note, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  // Dev-only: allow registering jobs/members in memory-mode so the application service
  // can validate existence without MySQL.
  app.post('/__dev/registerJob', async (req, res) => {
    try {
      const job_id = requireString(req.body.job_id, 'job_id');
      const status = req.body.status === 'closed' ? 'closed' : 'open';
      repository.addJob?.({ job_id, status });
      return sendSuccess(res, { registered: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/__dev/registerMember', async (req, res) => {
    try {
      const member_id = requireString(req.body.member_id, 'member_id');
      repository.addMember?.({ member_id });
      return sendSuccess(res, { registered: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/submit', async (req, res) => {
    try {
      const created = await repository.submit(validateSubmitPayload(req.body));
      if (created.missing) {
        return sendError(res, 404, created.missing, created.missing === 'JOB_NOT_FOUND' ? 'job was not found' : 'member was not found');
      }
      if (created.conflict) {
        return sendError(res, 409, created.conflict, created.conflict === 'JOB_CLOSED' ? 'job is closed' : 'member has already applied');
      }

      publishOrOutbox('application.submitted', buildEnvelope({
        eventType: 'application.submitted',
        actorId: req.body.member_id,
        entityType: 'application',
        entityId: created.application_id,
        payload: { application_id: created.application_id, job_id: req.body.job_id, member_id: req.body.member_id }
      })).catch(() => {});

      return sendSuccess(res, { application_id: created.application_id }, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/get', async (req, res) => {
    try {
      const application = await repository.getApplication(requireString(req.body.application_id, 'application_id'));
      if (!application) {
        throw new NotFoundError('APPLICATION_NOT_FOUND', 'application was not found');
      }
      return sendSuccess(res, application);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/byJob', async (req, res) => {
    try {
      const { page, pageSize } = getPagination(req.body);
      const result = await repository.listByJob(requireString(req.body.job_id, 'job_id'), page, pageSize);
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/byMember', async (req, res) => {
    try {
      const { page, pageSize } = getPagination(req.body);
      const result = await repository.listByMember(requireString(req.body.member_id, 'member_id'), page, pageSize);
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/updateStatus', async (req, res) => {
    try {
      const applicationId = requireString(req.body.application_id, 'application_id');
      const status = requireString(req.body.status, 'status');
      const note = optionalString(req.body.note) || optionalString(req.body.rejection_reason);
      if (!VALID_APPLICATION_STATUSES.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'status must be a valid application status', {
          field: 'status',
          allowed: [...VALID_APPLICATION_STATUSES]
        });
      }
      const current = await repository.getApplication(applicationId);
      if (!current) {
        throw new NotFoundError('APPLICATION_NOT_FOUND', 'application was not found');
      }
      if (!VALID_TRANSITIONS[current.status]?.has(status)) {
        return sendError(res, 400, 'INVALID_STATUS_TRANSITION', 'invalid application status transition', {
          from: current.status,
          to: status
        });
      }
      const result = await repository.updateStatus(applicationId, status, note);

      publishOrOutbox('application.status.updated', buildEnvelope({
        eventType: 'application.status.updated',
        actorId: 'system',
        entityType: 'application',
        entityId: applicationId,
        payload: { application_id: applicationId, from: current.status, to: status }
      })).catch(() => {});

      return sendSuccess(res, { success: true, ...result });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/applications/addNote', async (req, res) => {
    try {
      const applicationId = requireString(req.body.application_id, 'application_id');
      // Frontend currently sends { application_id, note } while professor spec uses recruiter_id + note_text.
      const recruiterId = optionalString(req.body.recruiter_id) || 'unknown';
      const noteText = req.body.note_text ? requireString(req.body.note_text, 'note_text') : requireString(req.body.note, 'note');
      const note = await repository.addNote(applicationId, recruiterId, noteText);
      if (!note) {
        throw new NotFoundError('APPLICATION_NOT_FOUND', 'application was not found');
      }
      return sendSuccess(res, { success: true, note_id: note.note_id });
    } catch (error) {
      return handleError(res, error);
    }
  });

  return app;
}
