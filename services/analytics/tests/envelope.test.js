// Pure unit tests for the API response envelope helpers.
// No DB, no Redis, no Kafka — these validate the shape frozen in the API contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail, ApiError } from '../src/util/envelope.js';

test('ok() wraps data with success=true and a trace_id', () => {
  const env = ok({ hello: 'world' }, 'trace-abc');
  assert.equal(env.success, true);
  assert.deepEqual(env.data, { hello: 'world' });
  assert.equal(env.trace_id, 'trace-abc');
  assert.equal(env.error, undefined);
});

test('ok() generates a uuid trace_id when caller omits one', () => {
  const env = ok({ x: 1 });
  assert.equal(env.success, true);
  assert.match(env.trace_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('fail() wraps error with success=false and preserves code/message/details', () => {
  const env = fail('NOT_FOUND', 'Resource missing', { id: '42' }, 'trace-xyz');
  assert.equal(env.success, false);
  assert.equal(env.trace_id, 'trace-xyz');
  assert.deepEqual(env.error, {
    code: 'NOT_FOUND',
    message: 'Resource missing',
    details: { id: '42' },
  });
  assert.equal(env.data, undefined);
});

test('fail() defaults details to {} when omitted', () => {
  const env = fail('BAD', 'broken');
  assert.deepEqual(env.error.details, {});
});

test('ApiError carries statusCode, code, and details', () => {
  const err = new ApiError(409, 'CONFLICT', 'Duplicate', { key: 'foo' });
  assert.ok(err instanceof Error);
  assert.equal(err.statusCode, 409);
  assert.equal(err.code, 'CONFLICT');
  assert.equal(err.message, 'Duplicate');
  assert.deepEqual(err.details, { key: 'foo' });
});
