// Minimal Profile Service read/write paths.
// TEMPORARY: intended to unblock the Member 5 benchmark suite until
// Ayush's (Member 1) real Profile Service ships. The cache-aside wiring is
// the permanent part — Ayush can layer business logic on top without
// touching the cache call sites.

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';
import { getOrSet, invalidate, invalidatePrefix, keys } from '../../../shared/cache.js';
import { config } from '../config.js';
import { maybeStoreDataUrl, mapMemberMediaRow } from '../util/objectStore.js';
import { publishOrOutbox } from '../../../shared/src/outbox.js';
import { buildEnvelope } from '../../../shared/src/kafka.js';

export const membersRouter = Router();

function emitMemberLifecycle(req, topic, eventType, memberId, payload = {}) {
  publishOrOutbox(
    topic,
    buildEnvelope({
      eventType,
      actorId: memberId,
      entityType: 'member',
      entityId: memberId,
      payload: { member_id: memberId, ...payload },
      traceId: req.traceId,
    }),
  ).catch(() => {});
}

const CreateProfessorSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  about: z.string().optional().nullable(),
  // Data URLs when object store is off can be large; MEDIUMTEXT on DB holds up to 16MB.
  profile_photo_url: z.string().max(12_000_000).optional().nullable(),
  skills: z.array(z.string()).optional().default([]),
});

const CreateSignupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
  full_name: z.string().min(1).max(200),
  location: z.string().max(255),
  headline: z.string().max(500).optional().nullable(),
  role: z.enum(['member', 'recruiter']).optional().default('member'),
});

// Signup bodies include `password` + `full_name`; professor contract uses split names — try signup first.
const CreateSchema = z.union([CreateSignupSchema, CreateProfessorSchema]);

async function handleCreateMember(req, res, next) {
  try {
    const raw = validate(CreateSchema, req.body);
    if ('full_name' in raw) {
      // Frontend signup shape -> create member and return { token, user }
      if (raw.role === 'recruiter') {
        throw new ApiError(400, 'INVALID_ROLE', 'Use /recruiters/create for recruiter signup');
      }
      const parts = raw.full_name.trim().split(/\s+/).filter(Boolean);
      const first_name = parts[0] || 'Member';
      const last_name = parts.slice(1).join(' ') || 'User';
      const body = {
        first_name,
        last_name,
        email: raw.email,
        phone: null,
        location: raw.location,
        headline: raw.headline ?? null,
        about: null,
        profile_photo_url: null,
        skills: [],
      };
      const pool = getPool();
      const memberId = uuidv4();

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `INSERT INTO members
             (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url)
           VALUES
             (:member_id, :first_name, :last_name, :email, :phone, :location, :headline, :about, :profile_photo_url)`,
          {
            member_id: memberId,
            ...body,
            phone: null,
            about: null,
            profile_photo_url: null,
          },
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
          throw new ApiError(409, 'DUPLICATE_EMAIL', 'A member with that email already exists');
        }
        throw err;
      } finally {
        conn.release();
      }

      await invalidatePrefix('member:search:');
      emitMemberLifecycle(req, 'member.created', 'member.created', memberId, { email: raw.email });
      const token = `dev-token-${uuidv4()}`;
      const user = {
        member_id: memberId,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`.trim(),
        email: raw.email,
        phone: null,
        location: raw.location,
        headline: raw.headline ?? null,
        about: null,
        profile_photo_url: null,
        skills: [],
        experience: [],
        education: [],
        connections_count: 0,
        role: 'member',
      };
      return res.status(201).json(ok({ token, user }, req.traceId));
    }

    const pool = getPool();
    const memberId = uuidv4();
    const body = { ...raw };
    if (body.profile_photo_url && String(body.profile_photo_url).startsWith('data:')) {
      const stored = await maybeStoreDataUrl({
        kind: 'profile-photo',
        memberId,
        dataUrl: body.profile_photo_url,
      });
      body.profile_photo_url = stored.url;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO members
           (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url)
         VALUES
           (:member_id, :first_name, :last_name, :email, :phone, :location, :headline, :about, :profile_photo_url)`,
        { member_id: memberId, ...body, phone: body.phone || null, location: body.location || null,
          headline: body.headline || null, about: body.about || null,
          profile_photo_url: body.profile_photo_url || null },
      );
      if (body.skills.length) {
        const values = body.skills.map((s) => [memberId, s]);
        await conn.query('INSERT IGNORE INTO member_skills (member_id, skill) VALUES ?', [values]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'DUPLICATE_EMAIL', 'A member with that email already exists');
      }
      throw err;
    } finally {
      conn.release();
    }

    await invalidatePrefix('member:search:');
    emitMemberLifecycle(req, 'member.created', 'member.created', memberId);

    return res.status(201).json(ok({ member_id: memberId, ...body }, req.traceId));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// REST compatibility (pytest integration suite expects these)
// ---------------------------------------------------------------------------

function coerceNotFoundCode(err) {
  // The integration test suite expects NOT_FOUND for missing entities, even if
  // the legacy implementation uses more specific codes like MEMBER_NOT_FOUND.
  if (err instanceof ApiError && err.statusCode === 404) {
    return new ApiError(404, 'NOT_FOUND', err.message);
  }
  return err;
}

// POST /members  (same as /members/create)
membersRouter.post('/members', handleCreateMember);

// POST /members/create (legacy)
membersRouter.post('/members/create', handleCreateMember);

const GetSchema = z.object({ member_id: z.string().min(1) });

async function handleGetMember(req, res, next) {
  try {
    const candidate = req.body?.member_id ?? req.params?.member_id;
    const { member_id } = validate(GetSchema, { member_id: candidate });

    // Do not cache full member rows in Redis: profile photos change often and a stale
    // snapshot (or a cache hit before invalidation) makes other users see initials forever.
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM members WHERE member_id = :member_id LIMIT 1', { member_id });
    let data;
    if (rows.length === 0) {
      // Allow viewing recruiter profiles via the same `/members/get` route.
      // Frontend uses `/in/:memberId` everywhere (messaging, network, etc.) and recruiters
      // authenticate with member_id=recruiter_id, so treat recruiter ids as profile ids.
      const [recRows] = await pool.query(
        'SELECT recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, created_at FROM recruiters WHERE recruiter_id = :member_id LIMIT 1',
        { member_id },
      );
      if (recRows.length === 0) data = null;
      else {
        const r = recRows[0];
        const full = String(r.name || 'Recruiter').trim();
        const [first, ...rest] = full.split(/\s+/);
        data = {
          member_id: r.recruiter_id,
          first_name: first || full,
          last_name: rest.join(' ') || '',
          full_name: full,
          email: r.email,
          phone: r.phone ?? null,
          location: null,
          headline: `Recruiter at ${r.company_name || 'Company'}`,
          about: null,
          profile_photo_url: null,
          connections_count: 0,
          created_at: r.created_at,
          updated_at: r.created_at,
          skills: [],
          role: 'recruiter',
          company: {
            company_id: r.company_id,
            company_name: r.company_name,
            company_industry: r.company_industry ?? null,
            company_size: r.company_size ?? null,
          },
        };
      }
    } else {
      const [skills] = await pool.query('SELECT skill FROM member_skills WHERE member_id = :member_id', {
        member_id,
      });
      const { experiences, educations } = await loadExperiencesEducations(pool, member_id);
      data = shapeMemberForClient(rows[0], skills.map((s) => s.skill), experiences, educations);
    }

    if (!data) throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);

    return res.json(ok(mapMemberMediaRow(data), req.traceId));
  } catch (err) {
    next(coerceNotFoundCode(err));
  }
}

// POST /members/get (legacy)
membersRouter.post('/members/get', handleGetMember);

const ExperiencePayloadSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(300).optional().default(''),
  company: z.string().max(300).optional().default(''),
  employment_type: z.string().max(100).optional().default(''),
  location: z.string().max(300).optional().default(''),
  workplace: z.string().max(100).optional().default(''),
  start_date: z.union([z.string().max(64), z.null()]).optional(),
  end_date: z.union([z.string().max(64), z.null()]).optional(),
  description: z.string().max(8000).optional().default(''),
  skills: z.array(z.string().max(100)).optional().default([]),
  company_logo: z.union([z.string().max(2000), z.null()]).optional(),
});

const EducationPayloadSchema = z.object({
  id: z.string().min(1).max(80),
  school: z.string().max(300),
  school_logo: z.union([z.string().max(2000), z.null()]).optional(),
  degree: z.string().max(200).optional().default(''),
  field: z.string().max(200).optional().default(''),
  grade: z.union([z.string().max(100), z.null()]).optional(),
  start_date: z.union([z.string().max(64), z.null()]).optional(),
  end_date: z.union([z.string().max(64), z.null()]).optional(),
  skills: z.array(z.string().max(100)).optional().default([]),
});

const LicensePayloadSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(300),
  org: z.string().max(300),
  org_logo: z.union([z.string().max(2000), z.null()]).optional(),
  issue_date: z.string().max(64),
  credential_url: z.union([z.string().max(2000), z.null()]).optional(),
  preview_image: z.union([z.string().max(12_000_000), z.null()]).optional(),
});

const ProjectMediaPayloadSchema = z.object({
  id: z.string().max(80),
  image: z.string().max(12_000_000),
  title: z.string().max(500),
  url: z.string().max(2000),
});

const ProjectPayloadSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(300),
  associated_with: z.union([z.string().max(300), z.null()]).optional(),
  start_date: z.string().max(64),
  end_date: z.union([z.string().max(64), z.null()]).optional(),
  description: z.string().max(16000).optional().default(''),
  skills: z.array(z.string().max(100)).optional().default([]),
  media: z.array(ProjectMediaPayloadSchema).optional().default([]),
  project_url: z.union([z.string().max(2000), z.null()]).optional(),
});

function parseYmToSqlDate(ym) {
  if (ym == null || ym === '') return null;
  const s = String(ym).trim();
  const m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (!m) return null;
  const mo = m[2].padStart(2, '0');
  return `${m[1]}-${mo}-01`;
}

function yearFromYm(ym) {
  if (ym == null || ym === '') return null;
  const s = String(ym).trim();
  if (/present/i.test(s)) return null;
  const m = /^(\d{4})/.exec(s);
  return m ? Number(m[1]) : null;
}

function formatYmFromSqlDate(d) {
  if (!d) return '';
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${mo}`;
  }
  const s = String(d);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}` : '';
}

function parseExtrasJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function mapExpRowToApi(row) {
  const extras = parseExtrasJson(row.extras);
  const startStr = extras.start_date != null && extras.start_date !== '' ? extras.start_date : formatYmFromSqlDate(row.start_date);
  const endStr =
    row.is_current ? null : extras.end_date != null && extras.end_date !== '' ? extras.end_date : formatYmFromSqlDate(row.end_date);
  return {
    id: row.exp_id,
    title: row.title || '',
    company: row.company || '',
    employment_type: extras.employment_type ?? '',
    location: extras.location ?? '',
    workplace: extras.workplace ?? '',
    start_date: startStr || '',
    end_date: endStr || null,
    description: row.description || '',
    skills: Array.isArray(extras.skills) ? extras.skills : [],
    company_logo: extras.company_logo ?? null,
  };
}

function mapEduRowToApi(row) {
  const extras = parseExtrasJson(row.extras);
  const startStr =
    extras.start_date != null && extras.start_date !== ''
      ? extras.start_date
      : row.start_year != null
        ? String(row.start_year)
        : '';
  const endStr =
    extras.end_date != null && extras.end_date !== ''
      ? extras.end_date
      : row.end_year != null
        ? String(row.end_year)
        : null;
  return {
    id: row.edu_id,
    school: row.institution || '',
    school_logo: extras.school_logo ?? null,
    degree: row.degree || '',
    field: row.field || '',
    grade: extras.grade ?? null,
    start_date: startStr,
    end_date: endStr,
    skills: Array.isArray(extras.skills) ? extras.skills : [],
  };
}

async function loadExperiencesEducations(conn, member_id) {
  const [expRows] = await conn.query(
    `SELECT exp_id, company, title, start_date, end_date, description, is_current, extras
       FROM member_experience WHERE member_id = :member_id
       ORDER BY start_date DESC, exp_id DESC`,
    { member_id },
  );
  const [eduRows] = await conn.query(
    `SELECT edu_id, institution, degree, field, start_year, end_year, extras
       FROM member_education WHERE member_id = :member_id
       ORDER BY start_year DESC, edu_id DESC`,
    { member_id },
  );
  return {
    experiences: expRows.map(mapExpRowToApi),
    educations: eduRows.map(mapEduRowToApi),
  };
}

async function replaceMemberExperiences(conn, member_id, list) {
  await conn.query('DELETE FROM member_experience WHERE member_id = :member_id', { member_id });
  if (!Array.isArray(list) || list.length === 0) return;
  for (const raw of list) {
    const e = ExperiencePayloadSchema.parse(raw);
    const startD = parseYmToSqlDate(e.start_date);
    const isCurrent = e.end_date == null || String(e.end_date).trim() === '';
    const endD = isCurrent ? null : parseYmToSqlDate(e.end_date);
    const extras = {
      employment_type: e.employment_type,
      workplace: e.workplace,
      location: e.location,
      company_logo: e.company_logo ?? undefined,
      skills: e.skills,
      start_date: e.start_date ?? '',
      end_date: e.end_date ?? null,
    };
    await conn.query(
      `INSERT INTO member_experience (exp_id, member_id, company, title, start_date, end_date, description, is_current, extras)
       VALUES (:exp_id, :member_id, :company, :title, :start_date, :end_date, :description, :is_current, :extras)`,
      {
        exp_id: e.id,
        member_id,
        company: e.company,
        title: e.title,
        start_date: startD,
        end_date: endD,
        description: e.description || null,
        is_current: isCurrent,
        extras: JSON.stringify(extras),
      },
    );
  }
}

function extensionsFromRow(row) {
  const ext = parseExtrasJson(row?.profile_extensions);
  return {
    licenses: Array.isArray(ext.licenses) ? ext.licenses : [],
    projects: Array.isArray(ext.projects) ? ext.projects : [],
    courses: Array.isArray(ext.courses) ? ext.courses : [],
  };
}

/** Build client member payload; omit internal `profile_extensions` column. */
function shapeMemberForClient(row, skillNames, expOut, eduOut) {
  if (!row || typeof row !== 'object') return row;
  const { profile_extensions: _pe, ...core } = row;
  const { licenses, projects, courses } = extensionsFromRow(row);
  return {
    ...core,
    skills: skillNames,
    experiences: expOut,
    educations: eduOut,
    licenses,
    projects,
    courses,
  };
}

async function mergeProfileExtensions(conn, member_id, { licenses, projects, courses }) {
  const [r] = await conn.query(
    'SELECT profile_extensions FROM members WHERE member_id = :member_id FOR UPDATE',
    { member_id },
  );
  const prev = parseExtrasJson(r[0]?.profile_extensions);
  const next = { ...prev };
  if (licenses !== undefined) next.licenses = licenses;
  if (projects !== undefined) next.projects = projects;
  if (courses !== undefined) next.courses = courses;
  await conn.query('UPDATE members SET profile_extensions = :ext WHERE member_id = :member_id', {
    member_id,
    ext: JSON.stringify(next),
  });
}

async function replaceMemberEducations(conn, member_id, list) {
  await conn.query('DELETE FROM member_education WHERE member_id = :member_id', { member_id });
  if (!Array.isArray(list) || list.length === 0) return;
  for (const raw of list) {
    const e = EducationPayloadSchema.parse(raw);
    const endRaw = e.end_date != null && String(e.end_date).trim();
    const endYear = endRaw && !/present/i.test(String(e.end_date)) ? yearFromYm(e.end_date) : null;
    const extras = {
      school_logo: e.school_logo ?? undefined,
      grade: e.grade ?? undefined,
      skills: e.skills,
      start_date: e.start_date ?? '',
      end_date: e.end_date ?? null,
    };
    await conn.query(
      `INSERT INTO member_education (edu_id, member_id, institution, degree, field, start_year, end_year, extras)
       VALUES (:edu_id, :member_id, :institution, :degree, :field, :start_year, :end_year, :extras)`,
      {
        edu_id: e.id,
        member_id,
        institution: e.school,
        degree: e.degree,
        field: e.field,
        start_year: yearFromYm(e.start_date),
        end_year: endYear,
        extras: JSON.stringify(extras),
      },
    );
  }
}

const UpdateSchema = z.object({
  member_id: z.string().min(1),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  headline: z.string().max(500).nullable().optional(),
  about: z.string().nullable().optional(),
  profile_photo_url: z.string().max(12_000_000).nullable().optional(),
  cover_photo_url: z.string().max(12_000_000).nullable().optional(),
  skills: z.array(z.string().min(1).max(100)).optional(),
  experiences: z.array(ExperiencePayloadSchema).optional(),
  educations: z.array(EducationPayloadSchema).optional(),
  licenses: z.array(LicensePayloadSchema).max(50).optional(),
  projects: z.array(ProjectPayloadSchema).max(50).optional(),
  courses: z.array(z.string().max(500)).max(100).optional(),
});

/** Recruiters authenticate with member_id === recruiter_id but may only exist in `recruiters`. Materialize a mirror `members` row so POST /members/update can persist headline/photos/skills. */
async function ensureMemberRowForRecruiter(conn, member_id) {
  const [memRows] = await conn.query('SELECT member_id FROM members WHERE member_id = :member_id LIMIT 1', {
    member_id,
  });
  if (memRows.length > 0) return true;

  const [recRows] = await conn.query(
    `SELECT recruiter_id, name, email, phone, company_name
       FROM recruiters WHERE recruiter_id = :member_id LIMIT 1`,
    { member_id },
  );
  if (recRows.length === 0) return false;

  const r = recRows[0];
  const full = String(r.name || 'Recruiter').trim();
  const [first, ...rest] = full.split(/\s+/);
  const headline = `Recruiter at ${r.company_name || 'Company'}`;
  await conn.query(
    `INSERT INTO members
       (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url, cover_photo_url)
     VALUES
       (:member_id, :first_name, :last_name, :email, :phone, NULL, :headline, NULL, NULL, NULL)`,
    {
      member_id,
      first_name: first || full,
      last_name: rest.join(' ') || '',
      email: r.email,
      phone: r.phone ?? null,
      headline,
    },
  );
  return true;
}

async function handleUpdateMember(req, res, next) {
  try {
    const candidate = req.body?.member_id ?? req.params?.member_id;
    const { member_id, ...fields } = validate(UpdateSchema, { ...req.body, member_id: candidate });
    if (fields.profile_photo_url !== undefined && String(fields.profile_photo_url).startsWith('blob:')) {
      throw new ApiError(400, 'INVALID_PHOTO_URL', 'blob: URLs only work in one browser tab; re-upload the image from the profile editor.');
    }
    if (fields.cover_photo_url !== undefined && String(fields.cover_photo_url).startsWith('blob:')) {
      throw new ApiError(400, 'INVALID_PHOTO_URL', 'blob: URLs only work in one browser tab; re-upload the image from the profile editor.');
    }
    if (fields.profile_photo_url && String(fields.profile_photo_url).startsWith('data:')) {
      const stored = await maybeStoreDataUrl({
        kind: 'profile-photo',
        memberId: member_id,
        dataUrl: fields.profile_photo_url,
      });
      fields.profile_photo_url = stored.url;
    }
    if (fields.cover_photo_url && String(fields.cover_photo_url).startsWith('data:')) {
      const stored = await maybeStoreDataUrl({
        kind: 'cover-photo',
        memberId: member_id,
        dataUrl: fields.cover_photo_url,
      });
      fields.cover_photo_url = stored.url;
    }
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields provided');
    }
    const pool = getPool();
    const skills = Object.prototype.hasOwnProperty.call(fields, 'skills') ? fields.skills : undefined;
    const experiences = Object.prototype.hasOwnProperty.call(fields, 'experiences') ? fields.experiences : undefined;
    const educations = Object.prototype.hasOwnProperty.call(fields, 'educations') ? fields.educations : undefined;
    const licenses = Object.prototype.hasOwnProperty.call(fields, 'licenses') ? fields.licenses : undefined;
    const projects = Object.prototype.hasOwnProperty.call(fields, 'projects') ? fields.projects : undefined;
    const courses = Object.prototype.hasOwnProperty.call(fields, 'courses') ? fields.courses : undefined;
    const scalarEntries = entries.filter(
      ([k]) => !['skills', 'experiences', 'educations', 'licenses', 'projects', 'courses'].includes(k),
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const ensured = await ensureMemberRowForRecruiter(conn, member_id);
      if (!ensured) {
        throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
      }

      if (scalarEntries.length) {
        const setClause = scalarEntries.map(([k]) => `${k} = :${k}`).join(', ');
        const params = { member_id, ...Object.fromEntries(scalarEntries) };
        const [result] = await conn.query(
          `UPDATE members SET ${setClause} WHERE member_id = :member_id`,
          params,
        );
        if (result.affectedRows === 0) {
          throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
        }
      } else {
        const [exists] = await conn.query('SELECT member_id FROM members WHERE member_id = :member_id LIMIT 1', { member_id });
        if (!exists.length) {
          throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
        }
      }

      if (skills !== undefined) {
        await conn.query('DELETE FROM member_skills WHERE member_id = :member_id', { member_id });
        if (Array.isArray(skills) && skills.length) {
          const values = skills.map((s) => [member_id, s]);
          await conn.query('INSERT IGNORE INTO member_skills (member_id, skill) VALUES ?', [values]);
        }
      }

      if (experiences !== undefined) {
        await replaceMemberExperiences(conn, member_id, experiences);
      }
      if (educations !== undefined) {
        await replaceMemberEducations(conn, member_id, educations);
      }
      if (licenses !== undefined || projects !== undefined || courses !== undefined) {
        await mergeProfileExtensions(conn, member_id, { licenses, projects, courses });
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await invalidate(keys.member(member_id));
    await invalidatePrefix('member:search:');
    emitMemberLifecycle(req, 'member.updated', 'member.updated', member_id);

    // Return the updated member shape (pytest expects updated fields like headline/about).
    const [rows] = await pool.query(
      'SELECT * FROM members WHERE member_id = :member_id LIMIT 1',
      { member_id },
    );
    if (!rows.length) {
      throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
    }
    const [skillRows] = await pool.query(
      'SELECT skill FROM member_skills WHERE member_id = :member_id',
      { member_id },
    );
    const { experiences: expOut, educations: eduOut } = await loadExperiencesEducations(pool, member_id);
    return res.json(
      ok(
        mapMemberMediaRow(
          shapeMemberForClient(rows[0], skillRows.map((r) => r.skill), expOut, eduOut),
        ),
        req.traceId,
      ),
    );
  } catch (err) {
    next(coerceNotFoundCode(err));
  }
}

// PUT /members/:member_id (pytest)
membersRouter.put('/members/:member_id', handleUpdateMember);

// POST /members/update (legacy)
membersRouter.post('/members/update', handleUpdateMember);

const DeleteSchema = z.object({ member_id: z.string().min(1) });

async function handleDeleteMember(req, res, next) {
  try {
    const candidate = req.body?.member_id ?? req.params?.member_id;
    const { member_id } = validate(DeleteSchema, { member_id: candidate });
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM member_skills WHERE member_id = :member_id', { member_id });
      await conn.query('DELETE FROM member_experience WHERE member_id = :member_id', { member_id });
      await conn.query('DELETE FROM member_education WHERE member_id = :member_id', { member_id });
      const [result] = await conn.query(
        'DELETE FROM members WHERE member_id = :member_id',
        { member_id },
      );
      if (result.affectedRows === 0) {
        await conn.rollback();
        throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
      }
      await conn.commit();
    } finally {
      conn.release();
    }

    await invalidate(keys.member(member_id));
    await invalidatePrefix('member:search:');
    emitMemberLifecycle(req, 'member.deleted', 'member.deleted', member_id);

    return res.json(ok({ deleted: true, member_id }, req.traceId));
  } catch (err) {
    next(coerceNotFoundCode(err));
  }
}

// DELETE /members/:member_id (pytest)
membersRouter.delete('/members/:member_id', handleDeleteMember);

// POST /members/delete (legacy)
membersRouter.post('/members/delete', handleDeleteMember);

const SearchSchema = z.object({
  keyword: z.string().optional(),
  skill: z.string().optional(),
  location: z.string().optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(100).default(20),
});

async function handleSearchMembers(req, res, next) {
  try {
    const isGet = req.method === 'GET';
    const page = Number(req.query?.page ?? 1);
    const limit = Number(req.query?.limit ?? req.query?.page_size ?? 20);
    const keyword = (req.query?.q ?? req.query?.keyword ?? req.body?.keyword ?? '').toString() || undefined;
    const skill = (req.query?.skill ?? req.body?.skill ?? '').toString() || undefined;
    const location = (req.query?.location ?? req.body?.location ?? '').toString() || undefined;
    const filters = validate(
      SearchSchema,
      isGet
        ? { keyword, skill, location, page, page_size: limit }
        : req.body
    );
    const key = keys.memberSearch(filters);

    const data = await getOrSet(key, config.CACHE_TTL_SEARCH_SEC, async () => {
      const pool = getPool();
      const offset = (filters.page - 1) * filters.page_size;
      const where = [];
      const params = { page_size: filters.page_size, offset };

      if (filters.keyword) {
        // Full-text search can silently return 0 rows (missing FULLTEXT indexes, stopwords, short tokens).
        // Use LIKE for reliability in demos + small datasets.
        where.push('(first_name LIKE :kw_like OR last_name LIKE :kw_like OR headline LIKE :kw_like OR about LIKE :kw_like)');
        params.kw_like = `%${filters.keyword}%`;
      }
      if (filters.location) {
        where.push('location LIKE :loc');
        params.loc = `%${filters.location}%`;
      }
      if (filters.skill) {
        where.push('member_id IN (SELECT member_id FROM member_skills WHERE skill = :skill)');
        params.skill = filters.skill;
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const [rows] = await pool.query(
        `SELECT member_id, first_name, last_name, headline, location, profile_photo_url
           FROM members
           ${whereSql}
           ORDER BY created_at DESC
           LIMIT :page_size OFFSET :offset`,
        params,
      );
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM members ${whereSql}`,
        params,
      );
      return { results: rows, total: Number(total), page: filters.page, page_size: filters.page_size };
    });

    // Pytest expects either a list response OR an object with an `items` list.
    // Our legacy search returns `{ results, total, page, page_size }`.
    if (isGet) {
      return res.json(ok({ items: (data.results || []).map(mapMemberMediaRow) }, req.traceId));
    }
    return res.json(
      ok({ ...data, results: (data.results || []).map(mapMemberMediaRow) }, req.traceId),
    );
  } catch (err) {
    next(err);
  }
}

// GET /members/search?q=... (pytest)
membersRouter.get('/members/search', handleSearchMembers);

// POST /members/search (legacy)
membersRouter.post('/members/search', handleSearchMembers);

// ---------------------------------------------------------------------------
// GET /members (pytest pagination)
// ---------------------------------------------------------------------------

membersRouter.get('/members', async (req, res, next) => {
  try {
    const page = Number(req.query?.page ?? 1);
    const limit = Number(req.query?.limit ?? 20);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const offset = (safePage - 1) * safeLimit;

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT member_id, first_name, last_name, email, headline, location, profile_photo_url
         FROM members
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset`,
      { limit: safeLimit, offset },
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM members',
    );

    return res.json(
      ok({ items: rows.map(mapMemberMediaRow), total: Number(total), page: safePage, limit: safeLimit }, req.traceId),
    );
  } catch (err) {
    next(err);
  }
});

// IMPORTANT: keep parameterized route registrations LAST so they don't swallow
// fixed paths like `/members/search`.

// GET /members/:member_id (pytest)
membersRouter.get('/members/:member_id', handleGetMember);

// PUT /members/:member_id (pytest)
membersRouter.put('/members/:member_id', handleUpdateMember);

// DELETE /members/:member_id (pytest)
membersRouter.delete('/members/:member_id', handleDeleteMember);
