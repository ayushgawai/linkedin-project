import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';
import { maybeStorePostMediaDataUrl } from '../util/objectStore.js';

export const postsRouter = Router();

function normMemberId(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '');
}

postsRouter.post('/posts/upload-media', async (req, res, next) => {
  try {
    const body = validate(UploadMediaSchema, req.body || {});
    const result = await maybeStorePostMediaDataUrl({
      memberId: body.member_id,
      dataUrl: body.data_url,
    });
    if (!result.ok) {
      return res.status(400).json({ message: result.message, code: result.error });
    }
    return res.status(201).json(ok({ url: result.url }, req.traceId));
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/posts/toggle-like', async (req, res, next) => {
  try {
    const body = validate(ToggleLikeSchema, req.body || {});
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [postCheck] = await conn.query('SELECT post_id FROM posts WHERE post_id = :post_id LIMIT 1', {
        post_id: body.post_id,
      });
      if (!postCheck?.length) {
        await conn.rollback();
        return res.status(404).json({ message: 'Post not found' });
      }
      const [existing] = await conn.query(
        'SELECT 1 FROM post_likes WHERE post_id = :post_id AND member_id = :member_id LIMIT 1',
        { post_id: body.post_id, member_id: body.member_id },
      );
      const hasLike = Boolean(existing?.length);
      let liked_by_me;
      if (hasLike) {
        await conn.query('DELETE FROM post_likes WHERE post_id = :post_id AND member_id = :member_id', {
          post_id: body.post_id,
          member_id: body.member_id,
        });
        await conn.query('UPDATE posts SET reactions_count = GREATEST(0, reactions_count - 1) WHERE post_id = :post_id', {
          post_id: body.post_id,
        });
        liked_by_me = false;
      } else {
        await conn.query('INSERT INTO post_likes (post_id, member_id) VALUES (:post_id, :member_id)', {
          post_id: body.post_id,
          member_id: body.member_id,
        });
        await conn.query('UPDATE posts SET reactions_count = reactions_count + 1 WHERE post_id = :post_id', {
          post_id: body.post_id,
        });
        liked_by_me = true;
      }
      const [[row]] = await conn.query('SELECT reactions_count FROM posts WHERE post_id = :post_id LIMIT 1', {
        post_id: body.post_id,
      });
      await conn.commit();
      return res.json(
        ok(
          {
            reactions_count: Number(row?.reactions_count ?? 0),
            liked_by_me,
          },
          req.traceId,
        ),
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/posts/add-comment', async (req, res, next) => {
  try {
    const body = validate(AddCommentSchema, req.body || {});
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [postRows] = await conn.query('SELECT post_id FROM posts WHERE post_id = :post_id LIMIT 1', {
        post_id: body.post_id,
      });
      if (!postRows?.length) {
        await conn.rollback();
        return res.status(404).json({ message: 'Post not found' });
      }
      const comment_id = `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await conn.query(
        `INSERT INTO post_comments (comment_id, post_id, author_member_id, body)
         VALUES (:comment_id, :post_id, :author_member_id, :text_body)`,
        {
          comment_id,
          post_id: body.post_id,
          author_member_id: body.member_id,
          text_body: body.text,
        },
      );
      await conn.query('UPDATE posts SET comments_count = comments_count + 1 WHERE post_id = :post_id', {
        post_id: body.post_id,
      });
      await conn.commit();

      const pool2 = getPool();
      const [[cnt]] = await pool2.query('SELECT comments_count FROM posts WHERE post_id = :post_id LIMIT 1', {
        post_id: body.post_id,
      });
      const [joinedRows] = await pool2.query(
        `SELECT c.comment_id, c.post_id, c.author_member_id, c.body, c.created_at,
                m.first_name, m.last_name, m.headline, m.profile_photo_url
           FROM post_comments c
           LEFT JOIN members m ON m.member_id = c.author_member_id
          WHERE c.comment_id = :comment_id LIMIT 1`,
        { comment_id },
      );
      const comment = mapCommentRow(joinedRows?.[0]);
      return res.status(201).json(
        ok(
          {
            comment,
            comments_count: Number(cnt?.comments_count ?? 0),
          },
          req.traceId,
        ),
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/posts/delete-comment', async (req, res, next) => {
  try {
    const body = validate(DeleteCommentSchema, req.body || {});
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        'SELECT comment_id, post_id, author_member_id FROM post_comments WHERE comment_id = :comment_id LIMIT 1',
        { comment_id: body.comment_id },
      );
      const r = rows?.[0];
      if (!r) {
        await conn.rollback();
        return res.status(404).json({ message: 'Comment not found' });
      }
      if (normMemberId(r.author_member_id) !== normMemberId(body.member_id)) {
        await conn.rollback();
        return res.status(403).json({ message: 'Not allowed to delete this comment' });
      }
      await conn.query('DELETE FROM post_comments WHERE comment_id = :comment_id', {
        comment_id: body.comment_id,
      });
      await conn.query(
        'UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE post_id = :post_id',
        { post_id: r.post_id },
      );
      const [[cnt]] = await conn.query('SELECT comments_count FROM posts WHERE post_id = :post_id LIMIT 1', {
        post_id: r.post_id,
      });
      await conn.commit();
      return res.json(
        ok(
          {
            comment_id: body.comment_id,
            post_id: String(r.post_id),
            comments_count: Number(cnt?.comments_count ?? 0),
          },
          req.traceId,
        ),
      );
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

postsRouter.post('/posts/delete', async (req, res, next) => {
  try {
    const body = validate(DeletePostSchema, req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT author_member_id FROM posts WHERE post_id = :post_id LIMIT 1', {
      post_id: body.post_id,
    });
    const row = rows?.[0];
    if (!row) {
      return res.status(404).json({ message: 'Post not found' });
    }
    if (normMemberId(row.author_member_id) !== normMemberId(body.member_id)) {
      return res.status(403).json({ message: 'Not allowed to delete this post' });
    }
    await pool.query('DELETE FROM post_comments WHERE post_id = :post_id', { post_id: body.post_id });
    await pool.query('DELETE FROM post_likes WHERE post_id = :post_id', { post_id: body.post_id });
    await pool.query('DELETE FROM posts WHERE post_id = :post_id', { post_id: body.post_id });
    return res.json(ok({ deleted: true, post_id: body.post_id }, req.traceId));
  } catch (err) {
    next(err);
  }
});

const ListSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(6),
  tab: z.enum(['for_you', 'following']).default('for_you'),
  sort: z.enum(['top', 'recent']).default('top'),
  viewer_member_id: z.string().optional().nullable(),
});

const UploadMediaSchema = z.object({
  data_url: z.string().min(20),
  member_id: z.string().min(1),
});

const DeletePostSchema = z.object({
  post_id: z.string().min(1),
  member_id: z.string().min(1),
});

const ToggleLikeSchema = z.object({
  post_id: z.string().min(1),
  member_id: z.string().min(1),
});

const AddCommentSchema = z.object({
  post_id: z.string().min(1),
  member_id: z.string().min(1),
  text: z.string().min(1).max(8000),
});

const DeleteCommentSchema = z.object({
  comment_id: z.string().min(1),
  member_id: z.string().min(1),
});

const ActivityNotificationsSchema = z.object({
  member_id: z.string().min(1),
  limit: z.number().int().positive().max(80).optional().default(40),
});

const ListByAuthorSchema = z.object({
  author_member_id: z.string().min(1),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(20),
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

function mapCommentRow(row) {
  if (!row) return null;
  const author_name =
    row.first_name != null
      ? `${String(row.first_name)} ${String(row.last_name ?? '').trim()}`.trim() || 'Member'
      : 'Member';
  return {
    comment_id: String(row.comment_id),
    author_member_id: row.author_member_id != null ? String(row.author_member_id) : null,
    author_name,
    author_headline: row.headline || 'Professional',
    author_avatar_url: row.profile_photo_url || null,
    text: String(row.body ?? ''),
    time_ago: timeAgo(row.created_at),
  };
}

async function fetchCommentsForPost(pool, postId) {
  const [rows] = await pool.query(
    `SELECT c.comment_id, c.post_id, c.author_member_id, c.body, c.created_at,
            m.first_name, m.last_name, m.headline, m.profile_photo_url
       FROM post_comments c
       LEFT JOIN members m ON m.member_id = c.author_member_id
      WHERE c.post_id = :post_id
      ORDER BY c.created_at DESC
      LIMIT 8`,
    { post_id: postId },
  );
  return (rows || []).map((r) => mapCommentRow(r)).filter(Boolean);
}

/** One feed-shaped post (shared by list + get). `row` is a posts row with optional liked_by_me. */
async function buildPostPayload(pool, row) {
  const p = row;
  const author = await fetchAuthor(p.author_member_id);
  const author_name = author ? `${author.first_name} ${author.last_name}`.trim() : 'Member';
  const poll_options =
    p.poll_options && typeof p.poll_options === 'string' ? JSON.parse(p.poll_options) : p.poll_options;
  const comments = await fetchCommentsForPost(pool, p.post_id);
  return {
    post_id: String(p.post_id),
    author_member_id:
      p.author_member_id != null && p.author_member_id !== '' ? String(p.author_member_id) : null,
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
    liked_by_me: Boolean(Number(p.liked_by_me || 0)),
    reaction_icons: ['like'],
    comments,
  };
}

const GetPostSchema = z.object({
  post_id: z.string().min(1),
  viewer_member_id: z.string().optional().nullable(),
});

postsRouter.post('/posts/get', async (req, res, next) => {
  try {
    const body = validate(GetPostSchema, req.body || {});
    const pool = getPool();
    const viewer =
      body.viewer_member_id && String(body.viewer_member_id).trim()
        ? String(body.viewer_member_id).trim()
        : null;
    const likeSelect = viewer
      ? 'EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.member_id = :viewer) AS liked_by_me'
      : '0 AS liked_by_me';
    const params = viewer ? { post_id: body.post_id, viewer } : { post_id: body.post_id };
    const [rows] = await pool.query(
      `SELECT p.*, ${likeSelect}
         FROM posts p
        WHERE p.post_id = :post_id
        LIMIT 1`,
      params,
    );
    const row = rows?.[0];
    if (!row) {
      return res.status(404).json({ message: 'Post not found' });
    }
    const payload = await buildPostPayload(pool, row);
    return res.json(ok(payload, req.traceId));
  } catch (err) {
    next(err);
  }
});

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
          author_member_id: author_member_id != null ? String(author_member_id) : null,
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
    const { page, pageSize, tab, sort, viewer_member_id } = validate(ListSchema, req.body || {});
    const pool = getPool();
    const offset = (page - 1) * pageSize;

    const orderBy = sort === 'top' ? 'p.reactions_count DESC, p.created_at DESC' : 'p.created_at DESC';
    const viewer = viewer_member_id && String(viewer_member_id).trim() ? String(viewer_member_id).trim() : null;
    const likeSelect = viewer
      ? 'EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.member_id = :viewer) AS liked_by_me'
      : '0 AS liked_by_me';
    const listParams = viewer
      ? { limit: pageSize + 1, offset, viewer }
      : { limit: pageSize + 1, offset };
    const [rows] = await pool.query(
      `SELECT p.*, ${likeSelect}
         FROM posts p
        ORDER BY ${orderBy}
        LIMIT :limit OFFSET :offset`,
      listParams,
    );

    const slice = rows.slice(0, pageSize);
    const has_more = rows.length > pageSize;

    const poolList = getPool();
    const posts = await Promise.all(slice.map((p) => buildPostPayload(poolList, p)));

    // Tab filtering: keep it minimal (frontend already does some filtering).
    const filtered = tab === 'following' ? posts.filter((p) => p.author_degree === '1st') : posts;

    return res.json(ok({ posts: filtered, page, has_more }, req.traceId));
  } catch (err) {
    next(err);
  }
});

/** List posts authored by a member (newest first) for profile activity pages. */
postsRouter.post('/posts/list-by-author', async (req, res, next) => {
  try {
    const { author_member_id, page, pageSize, viewer_member_id } = validate(ListByAuthorSchema, req.body || {});
    const pool = getPool();
    const offset = (page - 1) * pageSize;
    const viewer = viewer_member_id && String(viewer_member_id).trim() ? String(viewer_member_id).trim() : null;
    const likeSelect = viewer
      ? 'EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.member_id = :viewer) AS liked_by_me'
      : '0 AS liked_by_me';
    const listParams = viewer
      ? { author_member_id, limit: pageSize + 1, offset, viewer }
      : { author_member_id, limit: pageSize + 1, offset };
    const [rows] = await pool.query(
      `SELECT p.*, ${likeSelect}
         FROM posts p
        WHERE p.author_member_id = :author_member_id
        ORDER BY p.created_at DESC
        LIMIT :limit OFFSET :offset`,
      listParams,
    );
    const slice = rows.slice(0, pageSize);
    const has_more = rows.length > pageSize;
    const posts = await Promise.all(slice.map((p) => buildPostPayload(pool, p)));
    return res.json(ok({ posts, page, has_more }, req.traceId));
  } catch (err) {
    next(err);
  }
});

/** Likes and comments on posts authored by `member_id` (for notification feed). */
postsRouter.post('/posts/activity-notifications', async (req, res, next) => {
  try {
    const body = validate(ActivityNotificationsSchema, req.body || {});
    const pool = getPool();
    const rnorm = normMemberId(body.member_id);
    const lim = body.limit ?? 40;
    const [rows] = await pool.query(
      `SELECT kind, dedupe_id, post_id, actor_member_id, actor_name, created_at, post_snippet, comment_preview
         FROM (
          SELECT 'post_like' AS kind,
                 CONCAT(pl.post_id, ':', pl.member_id) AS dedupe_id,
                 pl.post_id AS post_id,
                 pl.member_id AS actor_member_id,
                 TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))) AS actor_name,
                 pl.created_at AS created_at,
                 LEFT(TRIM(p.content), 160) AS post_snippet,
                 NULL AS comment_preview
            FROM post_likes pl
            INNER JOIN posts p ON p.post_id = pl.post_id
            LEFT JOIN members m ON m.member_id = pl.member_id
           WHERE REPLACE(LOWER(TRIM(COALESCE(p.author_member_id, ''))), '-', '') = :rnorm
             AND REPLACE(LOWER(TRIM(COALESCE(pl.member_id, ''))), '-', '') <>
                 REPLACE(LOWER(TRIM(COALESCE(p.author_member_id, ''))), '-', '')
          UNION ALL
          SELECT 'post_comment' AS kind,
                 c.comment_id AS dedupe_id,
                 c.post_id AS post_id,
                 c.author_member_id AS actor_member_id,
                 TRIM(CONCAT(COALESCE(m2.first_name, ''), ' ', COALESCE(m2.last_name, ''))) AS actor_name,
                 c.created_at AS created_at,
                 LEFT(TRIM(p2.content), 160) AS post_snippet,
                 LEFT(TRIM(c.body), 220) AS comment_preview
            FROM post_comments c
            INNER JOIN posts p2 ON p2.post_id = c.post_id
            LEFT JOIN members m2 ON m2.member_id = c.author_member_id
           WHERE REPLACE(LOWER(TRIM(COALESCE(p2.author_member_id, ''))), '-', '') = :rnorm
             AND REPLACE(LOWER(TRIM(COALESCE(c.author_member_id, ''))), '-', '') <>
                 REPLACE(LOWER(TRIM(COALESCE(p2.author_member_id, ''))), '-', '')
        ) u
        ORDER BY u.created_at DESC
        LIMIT :lim`,
      { rnorm, lim },
    );
    const items = (rows || []).map((row) => ({
      kind: row.kind,
      dedupe_id: String(row.dedupe_id),
      post_id: String(row.post_id),
      actor_member_id: row.actor_member_id != null ? String(row.actor_member_id) : null,
      actor_name: row.actor_name && String(row.actor_name).trim() ? String(row.actor_name).trim() : 'Someone',
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      post_snippet: row.post_snippet != null ? String(row.post_snippet) : '',
      comment_preview: row.comment_preview != null ? String(row.comment_preview) : null,
    }));
    return res.json(ok({ items }, req.traceId));
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

