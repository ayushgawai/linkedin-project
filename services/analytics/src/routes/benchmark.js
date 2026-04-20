// =============================================================================
// /benchmark/* — admin surface used by the Phase 5 JMeter suite.
//
//   POST /benchmark/seed    — runs the synthetic seeder (async, returns 202).
//                             Body: { sizes?, reset?, only? }
//   POST /benchmark/reset   — truncate MySQL + Mongo, alias for seed with reset.
//   POST /benchmark/stats   — row/doc counts across both stores.
//   POST /benchmark/cache/flush — FLUSHDB on the analytics Redis connection.
//
// Locked behind the BENCH_ADMIN_TOKEN env: every request must send
// X-Bench-Token: <token>. Default token "dev-only" for local runs.
// =============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../util/validator.js';
import { ok, ApiError } from '../util/envelope.js';
import { getPool } from '../db/mysql.js';
import { connectMongo } from '../db/mongo.js';
import { getRedis } from '../db/redis.js';
import { invalidatePrefix } from '../../../shared/cache.js';
import { runSeeder } from '../../../../scripts/bench/seed.js';
import { config } from '../config.js';

export const benchmarkRouter = Router();

const ADMIN_TOKEN = process.env.BENCH_ADMIN_TOKEN || 'dev-only';

// Only one seed at a time — running two in parallel against MySQL/Mongo
// gives confusing results and hammers the host.
let seedInFlight = false;

function requireAdmin(req, res, next) {
  const got = req.headers['x-bench-token'];
  if (got !== ADMIN_TOKEN) {
    return next(new ApiError(401, 'BENCH_UNAUTHORIZED', 'Missing or invalid X-Bench-Token'));
  }
  next();
}

const SeedSchema = z.object({
  sizes: z
    .object({
      recruiters: z.number().int().nonnegative().optional(),
      members: z.number().int().nonnegative().optional(),
      jobs: z.number().int().nonnegative().optional(),
      applications: z.number().int().nonnegative().optional(),
      connections: z.number().int().nonnegative().optional(),
      events: z.number().int().nonnegative().optional(),
    })
    .optional(),
  reset: z.boolean().optional().default(false),
  only: z.string().optional().nullable(),
  wait: z.boolean().optional().default(false),
});

benchmarkRouter.post('/benchmark/seed', requireAdmin, async (req, res, next) => {
  try {
    const { sizes, reset, only, wait } = validate(SeedSchema, req.body || {});

    if (seedInFlight) {
      throw new ApiError(409, 'SEED_IN_PROGRESS', 'A seed run is already active');
    }
    seedInFlight = true;

    const job = runSeeder({ sizes, reset, only })
      .then((result) => {
        req.log.info({ result }, 'seed complete');
        return result;
      })
      .catch((err) => {
        req.log.error({ err: err.message, stack: err.stack }, 'seed failed');
        throw err;
      })
      .finally(() => {
        seedInFlight = false;
      });

    if (wait) {
      const result = await job;
      return res.json(ok({ started: true, ...result }, req.traceId));
    }

    // Fire-and-forget: the seeder runs in the background and logs progress.
    job.catch(() => {});
    return res.status(202).json(
      ok(
        {
          started: true,
          async: true,
          hint: 'poll /benchmark/stats to watch progress, or re-POST with wait:true',
        },
        req.traceId,
      ),
    );
  } catch (err) {
    seedInFlight = false;
    next(err);
  }
});

benchmarkRouter.post('/benchmark/reset', requireAdmin, async (req, res, next) => {
  try {
    if (seedInFlight) {
      throw new ApiError(409, 'SEED_IN_PROGRESS', 'A seed run is already active');
    }
    seedInFlight = true;
    try {
      const result = await runSeeder({ reset: true, only: 'none' }); // reset, then skip all steps
      return res.json(ok({ reset: true, ...result }, req.traceId));
    } finally {
      seedInFlight = false;
    }
  } catch (err) {
    next(err);
  }
});

benchmarkRouter.post('/benchmark/stats', requireAdmin, async (req, res, next) => {
  try {
    const pool = getPool();
    const mdb = await connectMongo();

    const tables = ['recruiters', 'members', 'member_skills', 'jobs', 'job_skills',
      'applications', 'connections'];
    const mysqlCounts = {};
    for (const t of tables) {
      const [[row]] = await pool.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
      mysqlCounts[t] = Number(row.c);
    }

    const collections = ['events', 'profile_views', 'cache_metrics'];
    const mongoCounts = {};
    for (const c of collections) {
      mongoCounts[c] = await mdb.collection(c).countDocuments();
    }

    return res.json(
      ok(
        {
          seed_in_progress: seedInFlight,
          mysql: mysqlCounts,
          mongo: mongoCounts,
        },
        req.traceId,
      ),
    );
  } catch (err) {
    next(err);
  }
});

benchmarkRouter.post('/benchmark/cache/flush', requireAdmin, async (req, res, next) => {
  try {
    const r = getRedis();
    if (!r) {
      return res.json(ok({ flushed: false, reason: 'redis_disabled' }, req.traceId));
    }
    // FLUSHDB clears everything in the current Redis DB — safe here because
    // the benchmark uses DB 0 with no other tenants.
    await r.flushdb();

    // Also poke the shared helper prefixes for consistency / metrics.
    await invalidatePrefix('analytics:');
    await invalidatePrefix('member:');
    await invalidatePrefix('job:');
    await invalidatePrefix('recruiter:');

    req.log.info('redis flushed via /benchmark/cache/flush');
    return res.json(ok({ flushed: true }, req.traceId));
  } catch (err) {
    next(err);
  }
});

// Tiny smoke-test endpoint — unauthenticated — used by JMeter to confirm
// the analytics service is reachable before a run kicks off.
benchmarkRouter.get('/benchmark/ping', (req, res) => {
  res.json(ok({ pong: true, service: config.SERVICE_NAME }, req.traceId));
});
