import { Kafka, logLevel } from 'kafkajs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

const brokers = (process.env.KAFKA_BROKERS || '127.0.0.1:9092').split(',');

const kafka = new Kafka({
  clientId: 'linkedinclone',
  brokers,
  logLevel: logLevel.WARN,
  connectionTimeout: 5000,
  requestTimeout: 10000,
  retry: { retries: 2, initialRetryTime: 500, maxRetryTime: 5000 },
});

let producer = null;
let connected = false;

export async function connectProducer() {
  if (connected) return;
  producer = kafka.producer({
    allowAutoTopicCreation: false,
    retry: { retries: 2 },
  });
  try {
    await producer.connect();
    connected = true;
    console.log('Kafka producer connected');
  } catch (e) {
    console.error('Kafka producer connect failed (will retry on produce):', e.message);
    connected = false;
  }
}

export function isKafkaConnected() {
  return connected;
}

export async function produceEvent(topic, envelope) {
  if (!connected || !producer) return false;
  try {
    await producer.send({
      topic,
      messages: [{ key: envelope.entity.entity_id, value: JSON.stringify(envelope) }],
    });
    return true;
  } catch (e) {
    console.error(`Kafka produce to ${topic} failed:`, e.message);
    return false;
  }
}

export function buildEnvelope({ eventType, actorId, entityType, entityId, payload, traceId }) {
  return {
    event_type: eventType,
    trace_id: traceId || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor_id: actorId,
    entity: {
      entity_type: entityType,
      entity_id: entityId,
    },
    payload,
    idempotency_key: crypto.randomUUID(),
  };
}

export async function disconnectProducer() {
  if (producer) {
    try { await producer.disconnect(); } catch { /* ignore */ }
    connected = false;
  }
}
