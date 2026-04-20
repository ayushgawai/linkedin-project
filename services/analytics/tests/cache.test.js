// Unit tests for the shared cache-aside helper.
//
// Strategy:
//  - Pure helpers (hashObject, keys) are imported statically.
//  - For getOrSet/invalidate we force REDIS_ENABLED=false BEFORE dynamically
//    importing the module. That exercises the graceful-degradation path,
//    which is the only behaviour we can test without spinning up Redis.
//  - An integration test against a real Redis lives in the perf suite; this
//    file is meant to stay CI-friendly (no external services).

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.REDIS_ENABLED = 'false';
// Dynamic import AFTER env mutation so module-level constants see it.
const cache = await import('../../shared/cache.js');

test('hashObject is deterministic regardless of key order', () => {
  const a = cache.hashObject({ foo: 1, bar: [2, 3], nested: { y: 'y', x: 'x' } });
  const b = cache.hashObject({ nested: { x: 'x', y: 'y' }, bar: [2, 3], foo: 1 });
  assert.equal(a, b);
  assert.equal(a.length, 16);
});

test('hashObject changes when values change', () => {
  const a = cache.hashObject({ keyword: 'engineer' });
  const b = cache.hashObject({ keyword: 'designer' });
  assert.notEqual(a, b);
});

test('keys.* follow the master-prompt naming convention', () => {
  assert.equal(cache.keys.member('m-1'), 'member:m-1');
  assert.equal(cache.keys.job('j-1'), 'job:j-1');
  assert.equal(cache.keys.recruiter('r-1'), 'recruiter:r-1');
  assert.match(cache.keys.jobSearch({ keyword: 'eng' }), /^job:search:[0-9a-f]{16}$/);
  assert.match(
    cache.keys.analyticsTopJobs('applications', 30, 10, 'desc'),
    /^analytics:top_jobs:applications:30:10:desc$/,
  );
  assert.match(cache.keys.analyticsFunnel('j-1', 30), /^analytics:funnel:j-1:30$/);
  assert.match(
    cache.keys.analyticsGeo('j-1', 30, 10),
    /^analytics:geo:j-1:30:10$/,
  );
  assert.match(
    cache.keys.analyticsMemberDashboard('m-1', 30),
    /^analytics:member:m-1:30$/,
  );
});

test('getOrSet with Redis disabled calls the loader and returns its value', async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return { result: 'from-db', n: calls };
  };

  const first = await cache.getOrSet('some-key', 60, loader);
  assert.deepEqual(first, { result: 'from-db', n: 1 });

  // With cache disabled, every call MUST invoke the loader (no caching).
  const second = await cache.getOrSet('some-key', 60, loader);
  assert.deepEqual(second, { result: 'from-db', n: 2 });
});

test('invalidate / invalidatePrefix are no-ops when Redis is disabled', async () => {
  const n1 = await cache.invalidate('member:anything');
  const n2 = await cache.invalidatePrefix('analytics:');
  assert.equal(n1, 0);
  assert.equal(n2, 0);
});

test('isHealthy() reports false when Redis is disabled', () => {
  assert.equal(cache.isHealthy(), false);
});
