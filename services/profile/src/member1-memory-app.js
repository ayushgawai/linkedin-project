import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';

import { getPagination, normalizeStringArray, sendError, sendSuccess } from '../../shared/src/http.js';
import { checkMySqlHealth, query, withTransaction } from '../../shared/src/mysql.js';
import { ConflictError, NotFoundError, ValidationError, optionalString, requireEmail, requireString } from '../../shared/src/validation.js';

const BASE_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'location', 'headline', 'about', 'profile_photo_url'];

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ') || '';
  return { first_name: first, last_name: last };
}

function validateExperience(items = []) {
  if (!Array.isArray(items)) {
    throw new ValidationError('experience must be an array', { field: 'experience' });
  }

  return items.map((item, index) => ({
    company: requireString(item.company, `experience[${index}].company`),
    title: requireString(item.title, `experience[${index}].title`),
    start_date: item.start_date || null,
    end_date: item.end_date || null,
    description: optionalString(item.description),
    is_current: Boolean(item.is_current)
  }));
}

function validateEducation(items = []) {
  if (!Array.isArray(items)) {
    throw new ValidationError('education must be an array', { field: 'education' });
  }

  return items.map((item, index) => ({
    institution: requireString(item.institution, `education[${index}].institution`),
    degree: requireString(item.degree, `education[${index}].degree`),
    field: optionalString(item.field),
    start_year: item.start_year ?? null,
    end_year: item.end_year ?? null
  }));
}

function validateCreatePayload(body) {
  return {
    first_name: requireString(body.first_name, 'first_name'),
    last_name: requireString(body.last_name, 'last_name'),
    email: requireEmail(body.email),
    phone: optionalString(body.phone),
    location: optionalString(body.location),
    headline: optionalString(body.headline),
    about: optionalString(body.about),
    profile_photo_url: optionalString(body.profile_photo_url),
    skills: normalizeStringArray(body.skills),
    experience: validateExperience(body.experience || []),
    education: validateEducation(body.education || [])
  };
}

function validateSignupPayload(body) {
  return {
    email: requireEmail(body.email),
    password: requireString(body.password, 'password'),
    full_name: requireString(body.full_name, 'full_name'),
    location: requireString(body.location, 'location'),
    headline: optionalString(body.headline),
    role: body.role === 'recruiter' ? 'recruiter' : 'member'
  };
}

function validateRecruiterCreatePayload(body) {
  // Keep this permissive: frontend signup only sends basic identity.
  return {
    email: requireEmail(body.email),
    password: requireString(body.password, 'password'),
    full_name: requireString(body.full_name, 'full_name'),
    location: optionalString(body.location),
    headline: optionalString(body.headline),
    role: 'recruiter'
  };
}

function validateUpdatePayload(body) {
  requireString(body.member_id, 'member_id');

  const changes = {};

  for (const field of BASE_FIELDS) {
    if (field in body) {
      changes[field] = field === 'email' ? requireEmail(body[field]) : optionalString(body[field]);
    }
  }

  if ('skills' in body) {
    changes.skills = normalizeStringArray(body.skills);
  }

  if ('experience' in body) {
    changes.experience = validateExperience(body.experience);
  }

  if ('education' in body) {
    changes.education = validateEducation(body.education);
  }

  if (!Object.keys(changes).length) {
    throw new ValidationError('at least one field to update is required');
  }

  return { member_id: body.member_id, changes };
}

async function hydrateMember(memberId, executor = query) {
  const [memberRows] = await executor(
    `SELECT member_id, first_name, last_name, email, phone, location, headline, about,
            profile_photo_url, connections_count, created_at, updated_at
       FROM members
      WHERE member_id = ?`,
    [memberId]
  );

  if (!memberRows.length) {
    return null;
  }

  const member = memberRows[0];

  const [[skillRows], [experienceRows], [educationRows]] = await Promise.all([
    executor('SELECT skill FROM member_skills WHERE member_id = ? ORDER BY skill', [memberId]),
    executor(`SELECT exp_id, company, title, start_date, end_date, description, is_current
                FROM member_experience
               WHERE member_id = ?
            ORDER BY start_date DESC, exp_id DESC`, [memberId]),
    executor(`SELECT edu_id, institution, degree, field, start_year, end_year
                FROM member_education
               WHERE member_id = ?
            ORDER BY end_year DESC, edu_id DESC`, [memberId])
  ]);

  return {
    ...member,
    skills: skillRows.map((row) => row.skill),
    experience: experienceRows,
    education: educationRows
  };
}

export function createProfileMySqlRepository() {
  return {
    async health() {
      return checkMySqlHealth();
    },

    async createMember(input) {
      try {
        return await withTransaction(async (connection) => {
          const memberId = randomUUID();
          await connection.execute(
            `INSERT INTO members
              (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              memberId,
              input.first_name,
              input.last_name,
              input.email,
              input.phone,
              input.location,
              input.headline,
              input.about,
              input.profile_photo_url
            ]
          );

          for (const skill of input.skills) {
            await connection.execute('INSERT INTO member_skills (member_id, skill) VALUES (?, ?)', [memberId, skill]);
          }

          for (const experience of input.experience) {
            await connection.execute(
              `INSERT INTO member_experience
                (member_id, company, title, start_date, end_date, description, is_current)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                memberId,
                experience.company,
                experience.title,
                experience.start_date,
                experience.end_date,
                experience.description,
                experience.is_current
              ]
            );
          }

          for (const education of input.education) {
            await connection.execute(
              `INSERT INTO member_education
                (member_id, institution, degree, field, start_year, end_year)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                memberId,
                education.institution,
                education.degree,
                education.field,
                education.start_year,
                education.end_year
              ]
            );
          }

          return hydrateMember(memberId, connection.query.bind(connection));
        });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new ConflictError('DUPLICATE_EMAIL', 'member email already exists');
        }

        throw error;
      }
    },

    async createRecruiter(input) {
      const { first_name, last_name } = splitFullName(input.full_name);
      const companyId = randomUUID();
      const recruiterId = randomUUID();
      const companyName = (input.company_name || `${first_name || 'Recruiter'}'s Company`).slice(0, 300);
      const name = `${first_name} ${last_name}`.trim() || 'Recruiter';
      try {
        await query(
          `INSERT INTO recruiters
            (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, role, access_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recruiter', 'recruiter')`,
          [
            recruiterId,
            companyId,
            name,
            input.email,
            optionalString(input.phone),
            companyName,
            optionalString(input.company_industry),
            optionalString(input.company_size),
          ]
        );
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new ConflictError('DUPLICATE_EMAIL', 'recruiter email already exists');
        }
        throw error;
      }

      const [rows] = await query(
        `SELECT recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, role, access_level, created_at
           FROM recruiters
          WHERE recruiter_id = ?`,
        [recruiterId]
      );
      return rows[0];
    },

    async findUserByEmail(email) {
      const [memberRows] = await query(
        `SELECT member_id, first_name, last_name, email, phone, location, headline, about,
                profile_photo_url, connections_count, created_at, updated_at
           FROM members
          WHERE LOWER(email) = LOWER(?)
          LIMIT 1`,
        [email]
      );
      if (memberRows.length) {
        const memberId = memberRows[0].member_id;
        const user = await hydrateMember(memberId);
        return { role: 'member', user };
      }

      const [recruiterRows] = await query(
        `SELECT recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, role, access_level, created_at
           FROM recruiters
          WHERE LOWER(email) = LOWER(?)
          LIMIT 1`,
        [email]
      );
      if (recruiterRows.length) {
        const r = recruiterRows[0];
        // Map recruiter shape to frontend's "Member" supertype-ish fields.
        return {
          role: 'recruiter',
          user: {
            member_id: r.recruiter_id,
            first_name: r.name.split(' ')[0] || r.name,
            last_name: r.name.split(' ').slice(1).join(' ') || '',
            full_name: r.name,
            email: r.email,
            phone: r.phone,
            location: null,
            headline: null,
            about: null,
            profile_photo_url: null,
            skills: [],
            experience: [],
            education: [],
            connections_count: 0,
            created_at: r.created_at,
            updated_at: r.created_at,
            role: 'recruiter',
            company: {
              company_id: r.company_id,
              company_name: r.company_name,
              company_industry: r.company_industry,
              company_size: r.company_size
            }
          }
        };
      }

      return null;
    },

    async getMember(memberId) {
      return hydrateMember(memberId);
    },

    async updateMember(memberId, changes) {
      const existing = await hydrateMember(memberId);
      if (!existing) {
        return null;
      }

      try {
        return await withTransaction(async (connection) => {
          const next = { ...existing, ...changes };
          await connection.execute(
            `UPDATE members
                SET first_name = ?, last_name = ?, email = ?, phone = ?, location = ?,
                    headline = ?, about = ?, profile_photo_url = ?
              WHERE member_id = ?`,
            [
              next.first_name,
              next.last_name,
              next.email,
              next.phone,
              next.location,
              next.headline,
              next.about,
              next.profile_photo_url,
              memberId
            ]
          );

          if ('skills' in changes) {
            await connection.execute('DELETE FROM member_skills WHERE member_id = ?', [memberId]);
            for (const skill of changes.skills) {
              await connection.execute('INSERT INTO member_skills (member_id, skill) VALUES (?, ?)', [memberId, skill]);
            }
          }

          if ('experience' in changes) {
            await connection.execute('DELETE FROM member_experience WHERE member_id = ?', [memberId]);
            for (const experience of changes.experience) {
              await connection.execute(
                `INSERT INTO member_experience
                  (member_id, company, title, start_date, end_date, description, is_current)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [memberId, experience.company, experience.title, experience.start_date, experience.end_date, experience.description, experience.is_current]
              );
            }
          }

          if ('education' in changes) {
            await connection.execute('DELETE FROM member_education WHERE member_id = ?', [memberId]);
            for (const education of changes.education) {
              await connection.execute(
                `INSERT INTO member_education
                  (member_id, institution, degree, field, start_year, end_year)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [memberId, education.institution, education.degree, education.field, education.start_year, education.end_year]
              );
            }
          }

          return hydrateMember(memberId, connection.query.bind(connection));
        });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          throw new ConflictError('DUPLICATE_EMAIL', 'member email already exists');
        }

        throw error;
      }
    },

    async deleteMember(memberId) {
      return withTransaction(async (connection) => {
        await connection.execute(
          `DELETE an
             FROM application_notes an
             JOIN applications a ON a.application_id = an.application_id
            WHERE a.member_id = ?`,
          [memberId]
        );
        await connection.execute('DELETE FROM applications WHERE member_id = ?', [memberId]);
        await connection.execute('DELETE FROM member_skills WHERE member_id = ?', [memberId]);
        await connection.execute('DELETE FROM member_experience WHERE member_id = ?', [memberId]);
        await connection.execute('DELETE FROM member_education WHERE member_id = ?', [memberId]);
        const [result] = await connection.execute('DELETE FROM members WHERE member_id = ?', [memberId]);
        return result.affectedRows > 0;
      });
    },

    async searchMembers(filters) {
      const conditions = [];
      const params = [];

      if (filters.keyword) {
        conditions.push('(m.first_name LIKE ? OR m.last_name LIKE ? OR m.headline LIKE ? OR m.about LIKE ?)');
        const keyword = `%${filters.keyword}%`;
        params.push(keyword, keyword, keyword, keyword);
      }

      if (filters.location) {
        conditions.push('m.location LIKE ?');
        params.push(`%${filters.location}%`);
      }

      if (filters.skill) {
        conditions.push('EXISTS (SELECT 1 FROM member_skills ms WHERE ms.member_id = m.member_id AND LOWER(ms.skill) = LOWER(?))');
        params.push(filters.skill);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const offset = (filters.page - 1) * filters.pageSize;

      const [[countRow]] = await query(`SELECT COUNT(*) AS total FROM members m ${whereClause}`, params);
      const [rows] = await query(
        `SELECT m.member_id
           FROM members m
           ${whereClause}
       ORDER BY m.created_at DESC
          LIMIT ? OFFSET ?`,
        [...params, filters.pageSize, offset]
      );

      const results = await Promise.all(rows.map((row) => hydrateMember(row.member_id)));
      return {
        results,
        total: countRow.total,
        page: filters.page
      };
    }
  };
}

function handleError(res, error) {
  if (error instanceof ValidationError) {
    return sendError(res, 400, 'VALIDATION_ERROR', error.message, error.details);
  }

  if (error instanceof ConflictError) {
    return sendError(res, 409, error.code, error.message, error.details);
  }

  if (error instanceof NotFoundError) {
    return sendError(res, 404, error.code, error.message, error.details);
  }

  if (error.code === 'DUPLICATE_EMAIL') {
    return sendError(res, 409, 'DUPLICATE_EMAIL', 'member email already exists');
  }

  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'unexpected server error');
}

export function createProfileApp({ repository }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    const db = await repository.health();
    res.json({ status: db === 'connected' ? 'ok' : 'degraded', service: 'profile', db, kafka: 'disconnected' });
  });

  app.post('/members/create', async (req, res) => {
    try {
      // Dual-shape support:
      // 1) Professor-style member create: first_name/last_name/email/... -> returns Member
      // 2) Frontend signup: full_name/password/location/headline/role -> returns { token, user }
      if ('full_name' in req.body || 'password' in req.body || req.body.role) {
        const signup = validateSignupPayload(req.body);
        if (signup.role === 'recruiter') {
          const recruiter = await repository.createRecruiter(signup);
          const token = `dev-token-${randomUUID()}`;
          return sendSuccess(res, { token, user: { ...recruiter, role: 'recruiter' } }, 201);
        }

        const { first_name, last_name } = splitFullName(signup.full_name);
        const member = await repository.createMember(validateCreatePayload({
          first_name,
          last_name,
          email: signup.email,
          phone: null,
          location: signup.location,
          headline: signup.headline,
          about: null,
          profile_photo_url: null,
          skills: [],
          experience: [],
          education: []
        }));
        const token = `dev-token-${randomUUID()}`;
        return sendSuccess(res, { token, user: { ...member, role: 'member', full_name: `${member.first_name} ${member.last_name}`.trim() } }, 201);
      }

      const member = await repository.createMember(validateCreatePayload(req.body));
      return sendSuccess(res, member, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/recruiters/create', async (req, res) => {
    try {
      const input = validateRecruiterCreatePayload(req.body);
      const recruiter = await repository.createRecruiter(input);
      const token = `dev-token-${randomUUID()}`;
      return sendSuccess(res, { token, user: { ...recruiter, role: 'recruiter' } }, 201);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/auth/login', async (req, res) => {
    try {
      const email = requireEmail(req.body.email);
      requireString(req.body.password, 'password');
      const found = await repository.findUserByEmail(email);
      if (!found) {
        return sendError(res, 401, 'INVALID_CREDENTIALS', 'invalid email or password');
      }
      const token = `dev-token-${randomUUID()}`;
      return sendSuccess(res, { token, user: found.user }, 200);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/members/get', async (req, res) => {
    try {
      const memberId = requireString(req.body.member_id, 'member_id');
      const member = await repository.getMember(memberId);
      if (!member) {
        throw new NotFoundError('MEMBER_NOT_FOUND', 'member was not found');
      }

      return sendSuccess(res, member);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/members/update', async (req, res) => {
    try {
      const { member_id: memberId, changes } = validateUpdatePayload(req.body);
      const member = await repository.updateMember(memberId, changes);
      if (!member) {
        throw new NotFoundError('MEMBER_NOT_FOUND', 'member was not found');
      }

      return sendSuccess(res, member);
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/members/delete', async (req, res) => {
    try {
      const memberId = requireString(req.body.member_id, 'member_id');
      const deleted = await repository.deleteMember(memberId);
      if (!deleted) {
        throw new NotFoundError('MEMBER_NOT_FOUND', 'member was not found');
      }

      return sendSuccess(res, { deleted: true });
    } catch (error) {
      return handleError(res, error);
    }
  });

  app.post('/members/search', async (req, res) => {
    try {
      const { page, pageSize } = getPagination(req.body);
      const result = await repository.searchMembers({
        keyword: optionalString(req.body.keyword),
        skill: optionalString(req.body.skill),
        location: optionalString(req.body.location),
        page,
        pageSize
      });
      return sendSuccess(res, result);
    } catch (error) {
      return handleError(res, error);
    }
  });

  return app;
}
