// Unit tests for ingestEnvelope — the shared code path used by both the
// Kafka consumer and the HTTP /events/ingest route.
//
// We don't spin up Mongo in CI, so we inject a fake `collection` via the
// `ctx.collection` seam that ingestEnvelope accepts. The fake simulates
// the two observable behaviours we care about:
//
//   1. First insert of an idempotency_key succeeds.
//   2. A second insert of the same key fails with code === 11000 (Mongo's
//      duplicate-key error code for a unique index), and ingestEnvelope
//      treats that as an idempotent skip rather than a crash.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestEnvelope } from '../src/kafka/consumer.js';

function makeFakeCollection() {
  const seen = new Set();
  const inserted = [];
  return {
    inserted,
    async insertOne(doc) {
      const key = doc.idempotency_key;
      if (seen.has(key)) {
        const err = new Error('E11000 duplicate key error');
        err.code = 11000;
        throw err;
      }
      seen.add(key);
      inserted.push(doc);
      return { acknowledged: true, insertedId: `id-${inserted.length}` };
    },
  };
}

const sampleEnvelope = () => ({
  event_type: 'job.viewed',
  trace_id: 'trace-1',
  timestamp: new Date().toISOString(),
  actor_id: 'm-1',
  entity: { entity_type: 'job', entity_id: 'j-1' },
  payload: { source: 'search' },
  idempotency_key: 'job.viewed:m-1:j-1:2026-04-19',
});

test('persists a new event and reports duplicate=false', async () => {
  const collection = makeFakeCollection();
  const result = await ingestEnvelope(sampleEnvelope(), { source: 'http', collection });

  assert.deepEqual(result, { duplicate: false });
  assert.equal(collection.inserted.length, 1);
  const doc = collection.inserted[0];
  assert.equal(doc.event_type, 'job.viewed');
  assert.equal(doc.idempotency_key, 'job.viewed:m-1:j-1:2026-04-19');
  assert.equal(doc._source, 'http');
  assert.ok(doc._received_at instanceof Date);
});

test('duplicate idempotency_key is a silent skip, never a throw', async () => {
  const collection = makeFakeCollection();
  const env = sampleEnvelope();

  const first = await ingestEnvelope(env, { source: 'kafka', topic: 'job.viewed', partition: 0, collection });
  const second = await ingestEnvelope(env, { source: 'kafka', topic: 'job.viewed', partition: 0, collection });

  assert.deepEqual(first, { duplicate: false });
  assert.deepEqual(second, { duplicate: true });
  assert.equal(collection.inserted.length, 1, 'only the first insert should have persisted');
});

test('missing idempotency_key rejects with MISSING_IDEMPOTENCY_KEY', async () => {
  const collection = makeFakeCollection();
  const bad = { ...sampleEnvelope(), idempotency_key: undefined };

  await assert.rejects(
    () => ingestEnvelope(bad, { source: 'http', collection }),
    (err) => err.code === 'MISSING_IDEMPOTENCY_KEY',
  );
  assert.equal(collection.inserted.length, 0);
});

test('non-duplicate mongo errors propagate (not swallowed)', async () => {
  const collection = {
    inserted: [],
    async insertOne() {
      const err = new Error('connection refused');
      err.code = 'ECONNREFUSED';
      throw err;
    },
  };

  await assert.rejects(
    () => ingestEnvelope(sampleEnvelope(), { source: 'http', collection }),
    (err) => err.code === 'ECONNREFUSED',
  );
});

test('source/topic/partition context is preserved on the persisted doc', async () => {
  const collection = makeFakeCollection();
  await ingestEnvelope(sampleEnvelope(), {
    source: 'kafka',
    topic: 'job.viewed',
    partition: 2,
    collection,
  });

  const doc = collection.inserted[0];
  assert.equal(doc._source, 'kafka');
  assert.equal(doc._topic, 'job.viewed');
  assert.equal(doc._partition, 2);
});
