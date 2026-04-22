import { pool } from './db.js';
import { produceEvent, isKafkaConnected } from './kafka.js';

/**
 * Publish a Kafka event with outbox fallback.
 * If Kafka is up, sends directly. If it fails or Kafka is down,
 * writes to the outbox_events table for later retry.
 */
export async function publishOrOutbox(topic, envelope) {
  if (isKafkaConnected()) {
    const sent = await produceEvent(topic, envelope);
    if (sent) return { sent: true, outboxed: false };
  }

  await pool.execute(
    'INSERT INTO outbox_events (topic, envelope) VALUES (?, ?)',
    [topic, JSON.stringify(envelope)],
  );
  return { sent: false, outboxed: true };
}

/**
 * Polls outbox_events for unsent rows and attempts to publish them.
 * Marks rows as sent on success. Returns the number of events flushed.
 */
export async function flushOutbox(batchSize = 50) {
  if (!isKafkaConnected()) return 0;

  const [rows] = await pool.query(
    'SELECT id, topic, envelope FROM outbox_events WHERE sent = FALSE ORDER BY created_at ASC LIMIT ?',
    [batchSize],
  );
  if (!rows.length) return 0;

  let flushed = 0;
  for (const row of rows) {
    try {
      const envelope = typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope;
      const sent = await produceEvent(row.topic, envelope);
      if (sent) {
        await pool.execute(
          'UPDATE outbox_events SET sent = TRUE, sent_at = NOW() WHERE id = ?',
          [row.id],
        );
        flushed++;
      }
    } catch (e) {
      console.error(`[outbox] Failed to flush event ${row.id}:`, e.message);
    }
  }
  return flushed;
}

let pollerInterval = null;

/**
 * Start a background poller that flushes the outbox every `intervalMs` milliseconds.
 */
export function startOutboxPoller(intervalMs = 10000) {
  if (pollerInterval) return;
  pollerInterval = setInterval(async () => {
    try {
      const n = await flushOutbox();
      if (n > 0) console.log(`[outbox] Flushed ${n} events`);
    } catch (e) {
      console.error('[outbox] Poller error:', e.message);
    }
  }, intervalMs);
}

export function stopOutboxPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}
