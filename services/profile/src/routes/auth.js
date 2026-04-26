import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';

export const authRouter = Router();

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
});

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const { email } = validate(LoginSchema, req.body);
    const pool = getPool();

    // NOTE: Passwords are not persisted in this project; treat login as identity lookup.
    const [memberRows] = await pool.query(
      `SELECT member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url,
              connections_count, created_at, updated_at
         FROM members
        WHERE LOWER(email) = LOWER(:email)
        LIMIT 1`,
      { email },
    );
    if (memberRows.length) {
      const m = memberRows[0];
      const token = `dev-token-${uuidv4()}`;
      const user = {
        ...m,
        full_name: `${m.first_name} ${m.last_name}`.trim(),
        role: 'member',
      };
      return res.json(ok({ token, user }, req.traceId));
    }

    const [recruiterRows] = await pool.query(
      `SELECT recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, created_at
         FROM recruiters
        WHERE LOWER(email) = LOWER(:email)
        LIMIT 1`,
      { email },
    );
    if (recruiterRows.length) {
      const r = recruiterRows[0];
      const token = `dev-token-${uuidv4()}`;
      const user = {
        member_id: r.recruiter_id,
        recruiter_id: r.recruiter_id,
        company_id: r.company_id,
        full_name: r.name,
        first_name: String(r.name || '').split(' ')[0] || r.name,
        last_name: String(r.name || '').split(' ').slice(1).join(' ') || '',
        email: r.email,
        phone: r.phone ?? null,
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
          company_industry: r.company_industry ?? null,
          company_size: r.company_size ?? null,
        },
      };
      return res.json(ok({ token, user }, req.traceId));
    }

    throw new ApiError(401, 'INVALID_CREDENTIALS', 'invalid email or password');
  } catch (err) {
    next(err);
  }
});

const GoogleSchema = z.object({
  access_token: z.string().min(1),
});

authRouter.post('/auth/google', async (req, res, next) => {
  try {
    const { access_token } = validate(GoogleSchema, req.body);
    const pool = getPool();

    // Load Google user info from access token (frontend uses Google Identity Services token flow).
    const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${access_token}` },
    });
    if (!userInfoResp.ok) {
      throw new ApiError(401, 'GOOGLE_AUTH_FAILED', 'google access token invalid');
    }
    const info = await userInfoResp.json();
    const email = String(info?.email || '').trim().toLowerCase();
    const given_name = String(info?.given_name || '').trim();
    const family_name = String(info?.family_name || '').trim();
    const picture = String(info?.picture || '').trim();
    if (!email) {
      throw new ApiError(400, 'GOOGLE_AUTH_FAILED', 'google profile missing email');
    }

    // Existing member → login.
    const [memberRows] = await pool.query(
      `SELECT member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url,
              connections_count, created_at, updated_at
         FROM members
        WHERE LOWER(email) = LOWER(:email)
        LIMIT 1`,
      { email },
    );
    if (memberRows.length) {
      const m = memberRows[0];
      const token = `dev-token-${uuidv4()}`;
      const user = { ...m, full_name: `${m.first_name} ${m.last_name}`.trim(), role: 'member' };
      return res.json(ok({ token, user }, req.traceId));
    }

    // New member → signup.
    const member_id = uuidv4();
    const first_name = (given_name || email.split('@')[0] || 'Member').slice(0, 100);
    const last_name = (family_name || '').slice(0, 100);
    const profile_photo_url = picture || null;

    try {
      await pool.query(
        `INSERT INTO members
          (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url, connections_count)
         VALUES
          (:member_id, :first_name, :last_name, :email, NULL, NULL, NULL, NULL, :profile_photo_url, 0)`,
        { member_id, first_name, last_name, email, profile_photo_url },
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // Race: another request created it first → refetch and proceed.
        const [rows] = await pool.query(
          `SELECT member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url,
                  connections_count, created_at, updated_at
             FROM members
            WHERE LOWER(email) = LOWER(:email)
            LIMIT 1`,
          { email },
        );
        if (rows.length) {
          const m = rows[0];
          const token = `dev-token-${uuidv4()}`;
          const user = { ...m, full_name: `${m.first_name} ${m.last_name}`.trim(), role: 'member' };
          return res.json(ok({ token, user }, req.traceId));
        }
      }
      throw err;
    }

    const token = `dev-token-${uuidv4()}`;
    const user = {
      member_id,
      first_name,
      last_name,
      full_name: `${first_name} ${last_name}`.trim(),
      email,
      phone: null,
      location: null,
      headline: null,
      about: null,
      profile_photo_url,
      connections_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      role: 'member',
    };
    return res.json(ok({ token, user }, req.traceId));
  } catch (err) {
    next(err);
  }
});

