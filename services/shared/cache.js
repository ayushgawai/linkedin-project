// Shared Redis cache-aside helper for all Node services.
//
// Design principles:
//  - Graceful degradation: if Redis is unreachable, getOrSet() still returns
//    the loader's result; invalidate() is a no-op.
//  - Auto-configured from env so any service can just `import` and use.
//  - Metrics are emitted through a callback a service can register; if none
//    is registered we are silent (no console spam in tests).
//  - Lazy connection: the Redis client is only constructed on first use.

import Redis from 'ioredis';
import crypto from 'node:crypto';

const HOST = process.env.REDIS_HOST || 'localhost';
const PORT = Number(process.env.REDIS_PORT || 6379);
const ENABLED = (process.env.REDIS_ENABLED ?? 'true') === 'true';

let client = null;
let healthy = false;
let metricSink = null;

function getClient() {
  if (!ENABLED) return null;
  if (client) return client;
  client = new Redis({
    host: HOST,
    port: PORT,
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    reconnectOnError: () => true,
  });
  client.on('ready', () => {
    healthy = true;
    metricSink?.({ event: 'ready', host: HOST });
  });
  client.on('error', (err) => {
    healthy = false;
    metricSink?.({ event: 'error', err: err.message });
  });
  client.on('end', () => {
    healthy = false;
  });
  return client;
}

export function setMetricSink(fn) {
  metricSink = typeof fn === 'function' ? fn : null;
}

export function isHealthy() {
  return ENABLED && healthy;
}

/**
 * Explicit connectivity check for /health endpoints. Call this instead of
 * isHealthy() alone: lazy init never constructs the Redis client until
 * getClient() runs, so isHealthy() would stay false on cold start unless
 * a cached code path ran first.
 */
export async function pingRedis() {
  if (!ENABLED) return false;
  try {
    const r = getClient();
    if (!r) return false;
    const pong = await r.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

function now() {
  return process.hrtime.bigint();
}
function msSince(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000;
}

/**
 * Cache-aside read.
 *   1. Try Redis for `key`. On hit, JSON.parse and return.
 *   2. On miss (or Redis unhealthy), invoke loader(), persist its result in
 *      Redis with `ttlSec`, and return the loaded value.
 * Never throws on Redis failures — always falls through to the loader.
 */
export async function getOrSet(key, ttlSec, loader) {
  const r = getClient();
  const t0 = now();

  if (r && isHealthy()) {
    try {
      const cached = await r.get(key);
      if (cached !== null) {
        metricSink?.({
          operation: 'get',
          key,
          cache_hit: true,
          latency_ms: msSince(t0),
        });
        return JSON.parse(cached);
      }
    } catch {
      // Swallow Redis errors; fall through to DB.
    }
  }

  const value = await loader();

  const tLoad = msSince(t0);
  metricSink?.({
    operation: 'get',
    key,
    cache_hit: false,
    latency_ms: tLoad,
  });

  if (r && isHealthy()) {
    try {
      await r.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch {
      // Ignore SET failures — we already have the value for the caller.
    }
  }

  return value;
}

/** Delete a single key. No-op if Redis is unhealthy. */
export async function invalidate(key) {
  const r = getClient();
  if (!r || !isHealthy()) return 0;
  try {
    const n = await r.del(key);
    metricSink?.({ operation: 'invalidate', key, removed: n });
    return n;
  } catch {
    return 0;
  }
}

/**
 * Delete every key matching `prefix*`. Uses SCAN+UNLINK so it never blocks
 * the Redis main thread like the classic `KEYS pattern | DEL` would.
 */
export async function invalidatePrefix(prefix) {
  const r = getClient();
  if (!r || !isHealthy()) return 0;
  let total = 0;
  try {
    const stream = r.scanStream({ match: `${prefix}*`, count: 200 });
    for await (const batch of stream) {
      if (batch.length === 0) continue;
      const n = await r.unlink(batch);
      total += typeof n === 'number' ? n : 0;
    }
    metricSink?.({ operation: 'invalidate_prefix', prefix, removed: total });
  } catch {
    // Swallow; partial invalidation is better than crashing the write path.
  }
  return total;
}

/** Stable short hash for object-keyed cache entries (e.g. search filters). */
export function hashObject(obj) {
  const normalised = JSON.stringify(sortKeys(obj));
  return crypto.createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(value[k]);
        return acc;
      }, {});
  }
  return value;
}

/** Centralised cache key conventions — aligned with the group API documentation. */
export const keys = {
  member: (id) => `member:${id}`,
  job: (id) => `job:${id}`,
  jobSearch: (filters) => `job:search:${hashObject(filters)}`,
  recruiter: (id) => `recruiter:${id}`,
  memberSearch: (filters) => `member:search:${hashObject(filters)}`,
  analyticsTopJobs: (metric, windowDays, limit, sort) =>
    `analytics:top_jobs:${metric}:${windowDays}:${limit}:${sort}`,
  analyticsFunnel: (jobId, windowDays) => `analytics:funnel:${jobId}:${windowDays}`,
  analyticsGeo: (jobId, windowDays, limit) =>
    `analytics:geo:${jobId}:${windowDays}:${limit}`,
  analyticsMemberDashboard: (memberId, windowDays) =>
    `analytics:member:${memberId}:${windowDays}`,
};

/** Test/shutdown hook. */
export async function closeCache() {
  if (client) {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
    client = null;
    healthy = false;
  }
}
