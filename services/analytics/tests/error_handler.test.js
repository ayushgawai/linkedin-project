// Contract tests for the central error-handler middleware.
//
// Every response shape on the analytics service MUST match the frozen
// envelope in the master prompt. These tests mount the real middleware
// against a disposable express app with synthetic routes that throw the
// three categories of error: Zod validation, ApiError, and unknown.
//
// No real services (Mongo, Redis, Kafka, MySQL) are required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { traceMiddleware } from '../src/middleware/trace.js';
import { errorHandler, notFoundHandler } from '../src/middleware/error.js';
import { ApiError } from '../src/util/envelope.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(traceMiddleware);

  app.post('/throw-zod', (req, _res, next) => {
    try {
      z.object({ name: z.string().min(3) }).parse(req.body);
    } catch (err) {
      next(err);
    }
  });

  app.get('/throw-api', (_req, _res, next) => {
    next(new ApiError(409, 'CONFLICT', 'Resource conflict', { hint: 'try again' }));
  });

  app.get('/throw-unknown', (_req, _res, next) => {
    next(new Error('kaboom'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

test('Zod errors → 400 VALIDATION_ERROR envelope with issues array', async () => {
  const app = buildApp();
  const res = await request(app).post('/throw-zod').send({ name: 'no' });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.body.error.details.issues));
  assert.ok(res.body.error.details.issues.length > 0);
  const issue = res.body.error.details.issues[0];
  assert.ok(typeof issue.path === 'string');
  assert.ok(typeof issue.message === 'string');
  assert.match(res.body.trace_id, /.+/);
});

test('ApiError → uses the thrown statusCode + code + message', async () => {
  const app = buildApp();
  const res = await request(app).get('/throw-api');

  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'CONFLICT');
  assert.equal(res.body.error.message, 'Resource conflict');
  assert.deepEqual(res.body.error.details, { hint: 'try again' });
});

test('Unhandled errors → 500 INTERNAL_ERROR envelope, no stack leaked by default', async () => {
  const app = buildApp();
  const res = await request(app).get('/throw-unknown');

  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'INTERNAL_ERROR');
  // details.stack only present when NODE_ENV=development — tests don't set that.
  assert.equal(res.body.error.details.stack, undefined);
});

test('trace_id echoed from X-Trace-Id header when caller supplies one', async () => {
  const app = buildApp();
  const res = await request(app)
    .get('/throw-api')
    .set('X-Trace-Id', 'caller-provided-trace');

  assert.equal(res.body.trace_id, 'caller-provided-trace');
  assert.equal(res.headers['x-trace-id'], 'caller-provided-trace');
});

test('Unknown route → 404 ROUTE_NOT_FOUND envelope', async () => {
  const app = buildApp();
  const res = await request(app).get('/does-not-exist');

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  assert.match(res.body.error.message, /GET \/does-not-exist/);
});
