import { Kafka, logLevel } from 'kafkajs';
import { config } from '../config.js';
import { logger } from '../util/logger.js';
import { connectMongo } from '../db/mongo.js';

const TOPICS = [
  'job.viewed',
  'job.saved',
  'application.submitted',
  'application.status.updated',
  'connection.accepted',
  'connection.requested',
  'message.sent',
];

let kafka = null;
let consumer = null;
let kafkaHealthy = false;

export function isKafkaHealthy() {
  return config.KAFKA_ENABLED && kafkaHealthy;
}

export async function startKafkaConsumer() {
  if (!config.KAFKA_ENABLED) {
    logger.info('kafka disabled via config — skipping consumer startup');
    return;
  }

  kafka = new Kafka({
    clientId: config.KAFKA_CLIENT_ID,
    brokers: config.KAFKA_BROKERS.split(','),
    logLevel: logLevel.WARN,
    retry: { retries: 5, initialRetryTime: 300 },
  });

  consumer = kafka.consumer({
    groupId: config.KAFKA_CONSUMER_GROUP,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
  });

  await consumer.connect();
  kafkaHealthy = true;
  logger.info({ brokers: config.KAFKA_BROKERS, group: config.KAFKA_CONSUMER_GROUP }, 'kafka consumer connected');

  for (const topic of TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  logger.info({ topics: TOPICS }, 'kafka consumer subscribed');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;
      let envelope;
      try {
        envelope = JSON.parse(raw);
      } catch (err) {
        logger.warn({ topic, err: err.message, raw: raw.slice(0, 200) }, 'kafka message: invalid JSON — skipping');
        return;
      }
      await ingestEnvelope(envelope, { source: 'kafka', topic, partition });
    },
  });
}

// Exported so HTTP /events/ingest and the Kafka consumer share one code path.
export async function ingestEnvelope(envelope, ctx = {}) {
  const db = await connectMongo();
  const events = db.collection('events');

  if (!envelope?.idempotency_key) {
    logger.warn({ ctx }, 'envelope missing idempotency_key — rejecting');
    const err = new Error('Missing idempotency_key');
    err.code = 'MISSING_IDEMPOTENCY_KEY';
    throw err;
  }

  const doc = {
    ...envelope,
    _received_at: new Date(),
    _source: ctx.source || 'http',
    _topic: ctx.topic,
    _partition: ctx.partition,
  };

  try {
    await events.insertOne(doc);
    logger.debug(
      { idempotency_key: envelope.idempotency_key, event_type: envelope.event_type, source: ctx.source },
      'event persisted',
    );
    return { duplicate: false };
  } catch (err) {
    // Mongo duplicate-key error on the unique idempotency_key index → idempotent skip.
    if (err.code === 11000) {
      logger.info(
        { idempotency_key: envelope.idempotency_key },
        'duplicate event — skipped',
      );
      return { duplicate: true };
    }
    throw err;
  }
}

export async function stopKafkaConsumer() {
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch (err) {
      logger.warn({ err: err.message }, 'kafka consumer disconnect error');
    }
    consumer = null;
    kafkaHealthy = false;
  }
}
