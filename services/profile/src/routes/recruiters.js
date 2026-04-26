import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';

export const recruitersRouter = Router();

const CreateRecruiterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(255),
  full_name: z.string().min(1).max(200),
  location: z.string().max(255).optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  company_name: z.string().max(300).optional().nullable(),
  company_industry: z.string().max(200).optional().nullable(),
  company_size: z.string().max(100).optional().nullable(),
});

recruitersRouter.post('/recruiters/create', async (req, res, next) => {
  try {
    const body = validate(CreateRecruiterSchema, req.body);
    const pool = getPool();
    const recruiterId = uuidv4();
    const companyId = uuidv4();
    const companyName = (body.company_name || `${body.full_name.split(' ')[0] || 'Company'} Co`).slice(0, 300);

    try {
      await pool.query(
        `INSERT INTO recruiters
          (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, role, access_level)
         VALUES
          (:recruiter_id, :company_id, :name, :email, NULL, :company_name, :company_industry, :company_size, 'recruiter', 'recruiter')`,
        {
          recruiter_id: recruiterId,
          company_id: companyId,
          name: body.full_name,
          email: body.email,
          company_name: companyName,
          company_industry: body.company_industry || null,
          company_size: body.company_size || null,
        },
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'DUPLICATE_EMAIL', 'A recruiter with that email already exists');
      }
      throw err;
    }

    const token = `dev-token-${uuidv4()}`;
    const user = {
      member_id: recruiterId,
      recruiter_id: recruiterId,
      company_id: companyId,
      full_name: body.full_name,
      first_name: body.full_name.split(' ')[0] || body.full_name,
      last_name: body.full_name.split(' ').slice(1).join(' ') || '',
      email: body.email,
      phone: null,
      location: body.location ?? null,
      headline: body.headline ?? null,
      about: null,
      profile_photo_url: null,
      skills: [],
      experience: [],
      education: [],
      connections_count: 0,
      role: 'recruiter',
      company: {
        company_id: companyId,
        company_name: companyName,
        company_industry: body.company_industry ?? null,
        company_size: body.company_size ?? null,
      },
    };

    return res.status(201).json(ok({ token, user }, req.traceId));
  } catch (err) {
    next(err);
  }
});

