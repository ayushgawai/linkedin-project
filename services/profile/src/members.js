import crypto from 'node:crypto';
import { pool } from './db.js';

const DUPLICATE = 'ER_DUP_ENTRY';
const FOREIGN_KEY = 'ER_ROW_IS_REFERENCED_2';

function trace() {
  return crypto.randomUUID();
}

function err(res, status, code, message, details = {}) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
    trace_id: trace(),
  });
}

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, trace_id: trace() });
}

const MEMBER_SELECT = `SELECT member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url, connections_count, created_at, updated_at
  FROM members WHERE member_id = ?`;

function validateCreate(body) {
  const m = new Map();
  if (!body || typeof body !== 'object') m.set('body', 'request body must be a JSON object');
  const fn = body?.first_name;
  const ln = body?.last_name;
  const em = body?.email;
  if (!fn || String(fn).trim() === '') m.set('first_name', 'required');
  if (!ln || String(ln).trim() === '') m.set('last_name', 'required');
  if (!em || String(em).trim() === '') m.set('email', 'required');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(em).trim())) m.set('email', 'invalid email format');
  return m;
}

async function loadMemberGraph(memberId) {
  const [rows] = await pool.execute(MEMBER_SELECT, [memberId]);
  if (!rows.length) return null;
  const member = mapMemberRow(rows[0]);
  const [skills] = await pool.query(
    'SELECT skill FROM member_skills WHERE member_id = ? ORDER BY skill',
    [memberId]
  );
  const [exps] = await pool.query(
    'SELECT exp_id, company, title, start_date, end_date, description, is_current FROM member_experience WHERE member_id = ?',
    [memberId]
  );
  const [edus] = await pool.query(
    'SELECT edu_id, institution, degree, field, start_year, end_year FROM member_education WHERE member_id = ?',
    [memberId]
  );
  member.skills = skills.map((r) => r.skill);
  member.experience = exps.map((e) => ({
    exp_id: e.exp_id,
    company: e.company,
    title: e.title,
    start_date: dateOnly(e.start_date),
    end_date: dateOnly(e.end_date),
    description: e.description,
    is_current: Boolean(e.is_current),
  }));
  member.education = edus.map((e) => ({
    edu_id: e.edu_id,
    institution: e.institution,
    degree: e.degree,
    field: e.field,
    start_year: e.start_year,
    end_year: e.end_year,
  }));
  return member;
}

function mapMemberRow(row) {
  return {
    member_id: row.member_id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    headline: row.headline,
    about: row.about,
    profile_photo_url: row.profile_photo_url,
    connections_count: row.connections_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function dateOnly(d) {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export async function createMember(req, res) {
  const body = req.body;
  const bad = validateCreate(body);
  if (bad.size) {
    return err(res, 400, 'VALIDATION_ERROR', 'Invalid input', { fields: Object.fromEntries(bad) });
  }

  const memberId = crypto.randomUUID();
  const first_name = String(body.first_name).trim();
  const last_name = String(body.last_name).trim();
  const email = String(body.email).trim().toLowerCase();
  const phone = body.phone == null || body.phone === '' ? null : String(body.phone);
  const location = body.location == null ? null : String(body.location);
  const headline = body.headline == null ? null : String(body.headline);
  const about = body.about == null ? null : String(body.about);
  const profile_photo_url =
    body.profile_photo_url == null || body.profile_photo_url === '' ? null : String(body.profile_photo_url);

  const skills = Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim()).filter(Boolean) : [];
  const experience = Array.isArray(body.experience) ? body.experience : [];
  const education = Array.isArray(body.education) ? body.education : [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO members (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [memberId, first_name, last_name, email, phone, location, headline, about, profile_photo_url]
    );

    for (const s of skills) {
      await conn.execute('INSERT INTO member_skills (member_id, skill) VALUES (?, ?)', [memberId, s]);
    }

    for (const exp of experience) {
      if (!exp || typeof exp !== 'object') continue;
      const eid = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO member_experience (exp_id, member_id, company, title, start_date, end_date, description, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eid,
          memberId,
          exp.company ?? null,
          exp.title ?? null,
          exp.start_date ?? null,
          exp.end_date ?? null,
          exp.description ?? null,
          Boolean(exp.is_current),
        ]
      );
    }

    for (const edu of education) {
      if (!edu || typeof edu !== 'object') continue;
      const eid = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO member_education (edu_id, member_id, institution, degree, field, start_year, end_year)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          eid,
          memberId,
          edu.institution ?? null,
          edu.degree ?? null,
          edu.field ?? null,
          edu.start_year == null ? null : Number(edu.start_year),
          edu.end_year == null ? null : Number(edu.end_year),
        ]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e.code === DUPLICATE) {
      return err(res, 409, 'DUPLICATE_EMAIL', 'A member with this email already exists', {});
    }
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to create member', {});
  } finally {
    conn.release();
  }

  const created = await loadMemberGraph(memberId);
  return ok(res, created, 201);
}

export async function getMember(req, res) {
  const { member_id } = req.body || {};
  if (!member_id || String(member_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'member_id is required', {});
  }
  const member = await loadMemberGraph(String(member_id).trim());
  if (!member) {
    return err(res, 404, 'MEMBER_NOT_FOUND', 'No member with this id', { member_id });
  }
  return ok(res, member);
}

const ALLOWED_UPDATE = new Set([
  'first_name',
  'last_name',
  'email',
  'phone',
  'location',
  'headline',
  'about',
  'profile_photo_url',
]);

export async function updateMember(req, res) {
  const body = req.body || {};
  const member_id = body.member_id;
  if (!member_id || String(member_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'member_id is required', {});
  }
  const id = String(member_id).trim();
  const [exists] = await pool.execute('SELECT 1 FROM members WHERE member_id = ? LIMIT 1', [id]);
  if (!exists.length) {
    return err(res, 404, 'MEMBER_NOT_FOUND', 'No member with this id', { member_id: id });
  }

  const fields = body.fields_to_update && typeof body.fields_to_update === 'object' ? body.fields_to_update : body;
  const sets = [];
  const values = [];
  for (const key of ALLOWED_UPDATE) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && key !== 'member_id') {
      sets.push(`\`${key}\` = ?`);
      if (key === 'email' && fields[key] != null) {
        const em = String(fields[key]).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
          return err(res, 400, 'VALIDATION_ERROR', 'Invalid email', { field: 'email' });
        }
        values.push(em);
      } else {
        values.push(fields[key] == null ? null : String(fields[key]));
      }
    }
  }
  const hasSkills = Object.prototype.hasOwnProperty.call(body, 'skills') && Array.isArray(body.skills);
  const hasExp = Object.prototype.hasOwnProperty.call(body, 'experience') && Array.isArray(body.experience);
  const hasEdu = Object.prototype.hasOwnProperty.call(body, 'education') && Array.isArray(body.education);
  if (!sets.length && !hasSkills && !hasExp && !hasEdu) {
    return err(res, 400, 'VALIDATION_ERROR', 'No updatable fields provided', {});
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (sets.length) {
      values.push(id);
      await conn.execute(
        `UPDATE members SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE member_id = ?`,
        values
      );
    }
    if (hasSkills) {
      await conn.execute('DELETE FROM member_skills WHERE member_id = ?', [id]);
      for (const s of body.skills) {
        const t = String(s).trim();
        if (t) await conn.execute('INSERT INTO member_skills (member_id, skill) VALUES (?, ?)', [id, t]);
      }
    }
    if (hasExp) {
      await conn.execute('DELETE FROM member_experience WHERE member_id = ?', [id]);
      for (const exp of body.experience) {
        if (!exp || typeof exp !== 'object') continue;
        const eid = crypto.randomUUID();
        await conn.execute(
          `INSERT INTO member_experience (exp_id, member_id, company, title, start_date, end_date, description, is_current)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            eid,
            id,
            exp.company ?? null,
            exp.title ?? null,
            exp.start_date ?? null,
            exp.end_date ?? null,
            exp.description ?? null,
            Boolean(exp.is_current),
          ]
        );
      }
    }
    if (hasEdu) {
      await conn.execute('DELETE FROM member_education WHERE member_id = ?', [id]);
      for (const edu of body.education) {
        if (!edu || typeof edu !== 'object') continue;
        const eid = crypto.randomUUID();
        await conn.execute(
          `INSERT INTO member_education (edu_id, member_id, institution, degree, field, start_year, end_year)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            eid,
            id,
            edu.institution ?? null,
            edu.degree ?? null,
            edu.field ?? null,
            edu.start_year == null ? null : Number(edu.start_year),
            edu.end_year == null ? null : Number(edu.end_year),
          ]
        );
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e.code === DUPLICATE) {
      return err(res, 409, 'DUPLICATE_EMAIL', 'A member with this email already exists', {});
    }
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to update member', {});
  } finally {
    conn.release();
  }

  const updated = await loadMemberGraph(id);
  return ok(res, updated);
}

export async function deleteMember(req, res) {
  const { member_id } = req.body || {};
  if (!member_id || String(member_id).trim() === '') {
    return err(res, 400, 'VALIDATION_ERROR', 'member_id is required', {});
  }
  const id = String(member_id).trim();
  const [exists] = await pool.execute('SELECT 1 FROM members WHERE member_id = ? LIMIT 1', [id]);
  if (!exists.length) {
    return err(res, 404, 'MEMBER_NOT_FOUND', 'No member with this id', { member_id: id });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Children first
    const [appRows] = await conn.query(
      'SELECT application_id FROM applications WHERE member_id = ?',
      [id]
    );
    for (const r of appRows) {
      await conn.execute('DELETE FROM application_notes WHERE application_id = ?', [r.application_id]);
    }
    await conn.execute('DELETE FROM applications WHERE member_id = ?', [id]);
    await conn.execute('DELETE FROM member_skills WHERE member_id = ?', [id]);
    await conn.execute('DELETE FROM member_experience WHERE member_id = ?', [id]);
    await conn.execute('DELETE FROM member_education WHERE member_id = ?', [id]);
    await conn.execute('DELETE FROM connections WHERE user_a = ? OR user_b = ?', [id, id]);
    const [delRes] = await conn.execute('DELETE FROM members WHERE member_id = ?', [id]);
    await conn.commit();
    if (delRes.affectedRows === 0) {
      return err(res, 404, 'MEMBER_NOT_FOUND', 'No member with this id', { member_id: id });
    }
  } catch (e) {
    await conn.rollback();
    if (e.code === FOREIGN_KEY) {
      return err(res, 409, 'CONFLICT', 'Member cannot be deleted while referenced by other data', {
        code: e.code,
      });
    }
    console.error(e);
    return err(res, 500, 'INTERNAL', 'Failed to delete member', {});
  } finally {
    conn.release();
  }

  return ok(res, { deleted: true });
}

function escapeLike(s) {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function searchMembers(req, res) {
  const body = req.body || {};
  const page = Math.max(1, parseInt(String(body.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(body.page_size), 10) || 20));
  const keyword = body.keyword == null || body.keyword === '' ? null : String(body.keyword).trim();
  const skill = body.skill == null || body.skill === '' ? null : String(body.skill).trim();
  const location = body.location == null || body.location === '' ? null : String(body.location).trim();

  const cond = [];
  const params = [];
  if (skill) {
    params.push(skill);
  }
  if (keyword) {
    const k = `%${escapeLike(keyword)}%`;
    cond.push(
      '(m.first_name LIKE ? OR m.last_name LIKE ? OR m.email LIKE ? OR IFNULL(m.headline, "") LIKE ? OR IFNULL(m.about, "") LIKE ?)'
    );
    params.push(k, k, k, k, k);
  }
  if (location) {
    const loc = `%${escapeLike(location)}%`;
    cond.push('IFNULL(m.location, "") LIKE ?');
    params.push(loc);
  }
  const skillJoinSql = skill
    ? 'INNER JOIN member_skills ms ON ms.member_id = m.member_id AND ms.skill = ?'
    : '';
  const fromSql = `FROM members m ${skillJoinSql}`;
  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  const countSql = `SELECT COUNT(DISTINCT m.member_id) AS c ${fromSql} ${whereSql}`;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0].c;
  const listSql = `SELECT DISTINCT m.member_id, m.first_name, m.last_name, m.email, m.phone, m.location, m.headline, m.about, m.profile_photo_url, m.connections_count, m.created_at, m.updated_at
    ${fromSql} ${whereSql}
    ORDER BY m.last_name, m.first_name
    LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(listSql, [...params, pageSize, offset]);
  const results = rows.map(mapMemberRow);
  return ok(res, { results, total, page, page_size: pageSize });
}
