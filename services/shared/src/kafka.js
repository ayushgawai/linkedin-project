import { Kafka, logLevel } from 'kafkajs';
import { randomUUID } from 'node:crypto';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const clientId = process.env.KAFKA_CLIENT_ID || 'linkedinclone';

const kafka = new Kafka({
  clientId,
  brokers,
  logLevel: logLevel.WARN,
  connectionTimeout: 5000,
  requestTimeout: 10000,
  retry: { retries: 2 }
});

let producer = null;
let connected = false;

export async function connectProducer() {
  if (connected) return;
  producer = kafka.producer();
  await producer.connect();
  connected = true;
  console.log('[kafka] producer connected');
}

export function isKafkaConnected() {
  return connected;
}

export async function produceEvent(topic, envelope) {
  if (!connected) throw new Error('KAFKA_UNAVAILABLE');
  await producer.send({
    topic,
    messages: [{ key: envelope.entity_id || randomUUID(), value: JSON.stringify(envelope) }]
  });
}

export function buildEnvelope({ eventType, actorId, entityType, entityId, payload, traceId }) {
  return {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    trace_id: traceId || randomUUID(),
    idempotency_key: randomUUID(),
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    payload: payload || {}
  };
}

export async function disconnectProducer() {
  if (producer) {
    await producer.disconnect();
    connected = false;
  }
}

export function getKafkaInstance() {
  return kafka;
}
