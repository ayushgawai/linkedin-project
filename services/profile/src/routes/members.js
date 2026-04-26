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

export const membersRouter = Router();

const CreateProfessorSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  about: z.string().optional().nullable(),
  profile_photo_url: z.string().url().max(500).optional().nullable(),
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

const CreateSchema = z.union([CreateProfessorSchema, CreateSignupSchema]);

membersRouter.post('/members/create', async (req, res, next) => {
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

    const body = raw;
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

    return res.status(201).json(ok({ member_id: memberId, ...body }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const GetSchema = z.object({ member_id: z.string().min(1) });

membersRouter.post('/members/get', async (req, res, next) => {
  try {
    const { member_id } = validate(GetSchema, req.body);
    const key = keys.member(member_id);

    const data = await getOrSet(key, config.CACHE_TTL_ENTITY_SEC, async () => {
      const pool = getPool();
      const [rows] = await pool.query(
        'SELECT * FROM members WHERE member_id = :member_id LIMIT 1',
        { member_id },
      );
      if (rows.length === 0) return null;
      const [skills] = await pool.query(
        'SELECT skill FROM member_skills WHERE member_id = :member_id',
        { member_id },
      );
      return { ...rows[0], skills: skills.map((s) => s.skill) };
    });

    if (!data) throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);

    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});

const UpdateSchema = z.object({
  member_id: z.string().min(1),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  headline: z.string().max(500).nullable().optional(),
  about: z.string().nullable().optional(),
  profile_photo_url: z.string().url().max(500).nullable().optional(),
});

membersRouter.post('/members/update', async (req, res, next) => {
  try {
    const { member_id, ...fields } = validate(UpdateSchema, req.body);
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No updatable fields provided');
    }
    const setClause = entries.map(([k]) => `${k} = :${k}`).join(', ');
    const params = { member_id, ...Object.fromEntries(entries) };

    const [result] = await getPool().query(
      `UPDATE members SET ${setClause} WHERE member_id = :member_id`,
      params,
    );
    if (result.affectedRows === 0) {
      throw new ApiError(404, 'MEMBER_NOT_FOUND', `Member ${member_id} not found`);
    }

    await invalidate(keys.member(member_id));
    await invalidatePrefix('member:search:');

    return res.json(ok({ member_id, updated: true, fields: Object.keys(fields) }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const DeleteSchema = z.object({ member_id: z.string().min(1) });

membersRouter.post('/members/delete', async (req, res, next) => {
  try {
    const { member_id } = validate(DeleteSchema, req.body);
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM member_skills WHERE member_id = :member_id', { member_id });
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

    return res.json(ok({ deleted: true, member_id }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const SearchSchema = z.object({
  keyword: z.string().optional(),
  skill: z.string().optional(),
  location: z.string().optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().max(100).default(20),
});

membersRouter.post('/members/search', async (req, res, next) => {
  try {
    const filters = validate(SearchSchema, req.body);
    const key = keys.memberSearch(filters);

    const data = await getOrSet(key, config.CACHE_TTL_SEARCH_SEC, async () => {
      const pool = getPool();
      const offset = (filters.page - 1) * filters.page_size;
      const where = [];
      const params = { page_size: filters.page_size, offset };

      if (filters.keyword) {
        where.push('MATCH(first_name, last_name, headline, about) AGAINST (:kw IN NATURAL LANGUAGE MODE)');
        params.kw = filters.keyword;
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

    return res.json(ok(data, req.traceId));
  } catch (err) {
    next(err);
  }
});
