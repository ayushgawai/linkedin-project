import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';

export const postsRouter = Router();

const ListSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(6),
  tab: z.enum(['for_you', 'following']).default('for_you'),
  sort: z.enum(['top', 'recent']).default('top'),
  viewer_member_id: z.string().optional().nullable(),
});

const CreateSchema = z.object({
  content: z.string().min(1),
  visibility: z.enum(['anyone', 'connections']).default('anyone'),
  media_type: z.enum(['text', 'image', 'article', 'poll']).optional().default('text'),
  media_url: z.string().max(2000).optional().nullable(),
  article_title: z.string().max(500).optional().nullable(),
  article_source: z.string().max(500).optional().nullable(),
  poll_options: z
    .array(z.object({ id: z.string(), label: z.string(), votes: z.number().int().nonnegative() }))
    .optional()
    .nullable(),
  author_member_id: z.string().optional().nullable(),
});

function timeAgo(createdAt) {
  if (!createdAt) return 'now';
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

async function fetchAuthor(memberId) {
  if (!memberId) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT member_id, first_name, last_name, headline, profile_photo_url FROM members WHERE member_id = :member_id LIMIT 1',
    { member_id: memberId },
  );
  return rows?.[0] ?? null;
}

postsRouter.post('/posts/create', async (req, res, next) => {
  try {
    const body = validate(CreateSchema, req.body || {});
    const pool = getPool();

    const post_id = `post-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const author_member_id = body.author_member_id || req.body?.member_id || null;

    await pool.query(
      `INSERT INTO posts
        (post_id, author_member_id, visibility, content, media_type, media_url, article_title, article_source, poll_options,
         reactions_count, comments_count, reposts_count)
       VALUES
        (:post_id, :author_member_id, :visibility, :content, :media_type, :media_url, :article_title, :article_source, :poll_options,
         0, 0, 0)`,
      {
        post_id,
        author_member_id,
        visibility: body.visibility,
        content: body.content,
        media_type: body.media_type || 'text',
        media_url: body.media_url || null,
        article_title: body.article_title || null,
        article_source: body.article_source || null,
        poll_options: body.poll_options ? JSON.stringify(body.poll_options) : null,
      },
    );

    const author = await fetchAuthor(author_member_id);
    const author_name = author ? `${author.first_name} ${author.last_name}`.trim() : 'You';

    return res.status(201).json(
      ok(
        {
          post_id,
          author_member_id,
          author_name,
          author_degree: '1st',
          author_headline: author?.headline || 'Professional',
          author_avatar_url: author?.profile_photo_url || null,
          created_time_ago: 'now',
          visibility: body.visibility,
          content: body.content,
          media_type: body.media_type || 'text',
          media_url: body.media_url || undefined,
          article_title: body.article_title || undefined,
          article_source: body.article_source || undefined,
          poll_options: body.poll_options || undefined,
          reactions_count: 0,
          comments_count: 0,
          reposts_count: 0,
          liked_by_me: false,
          reaction_icons: ['like'],
          comments: [],
        },
        req.traceId,
      ),
    );
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/posts/list', async (req, res, next) => {
  try {
    const { page, pageSize, tab, sort } = validate(ListSchema, req.body || {});
    const pool = getPool();
    const offset = (page - 1) * pageSize;

    const orderBy = sort === 'top' ? 'reactions_count DESC, created_at DESC' : 'created_at DESC';
    const [rows] = await pool.query(
      `SELECT p.*
         FROM posts p
        ORDER BY ${orderBy}
        LIMIT :limit OFFSET :offset`,
      { limit: pageSize + 1, offset },
    );

    const slice = rows.slice(0, pageSize);
    const has_more = rows.length > pageSize;

    const posts = await Promise.all(
      slice.map(async (p) => {
        const author = await fetchAuthor(p.author_member_id);
        const author_name = author ? `${author.first_name} ${author.last_name}`.trim() : 'Member';
        const poll_options =
          p.poll_options && typeof p.poll_options === 'string' ? JSON.parse(p.poll_options) : p.poll_options;
        return {
          post_id: p.post_id,
          author_member_id: p.author_member_id,
          author_name,
          author_degree: '1st',
          author_headline: author?.headline || 'Professional',
          author_avatar_url: author?.profile_photo_url || null,
          created_time_ago: timeAgo(p.created_at),
          visibility: p.visibility,
          content: p.content,
          media_type: p.media_type,
          media_url: p.media_url || undefined,
          article_title: p.article_title || undefined,
          article_source: p.article_source || undefined,
          poll_options: poll_options || undefined,
          reactions_count: Number(p.reactions_count || 0),
          comments_count: Number(p.comments_count || 0),
          reposts_count: Number(p.reposts_count || 0),
          liked_by_me: false,
          reaction_icons: ['like'],
          comments: [],
        };
      }),
    );

    // Tab filtering: keep it minimal (frontend already does some filtering).
    const filtered = tab === 'following' ? posts.filter((p) => p.author_degree === '1st') : posts;

    return res.json(ok({ posts: filtered, page, has_more }, req.traceId));
  } catch (err) {
    next(err);
  }
});

postsRouter.use((err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ message: err.message, code: err.code, details: err.details });
  }
  if (err && err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ message: 'Validation error', details: err.details || {} });
  }
  return res.status(500).json({ message: 'Posts service error', details: String(err?.message || err) });
});

