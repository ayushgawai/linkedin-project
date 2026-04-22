import { query } from './mysql.js';
import { produceEvent, isKafkaConnected } from './kafka.js';

export async function publishOrOutbox(topic, envelope) {
  if (isKafkaConnected()) {
    try {
      await produceEvent(topic, envelope);
      return;
    } catch {
      // fall through to outbox
    }
  }

  await query(
    'INSERT INTO outbox_events (topic, envelope) VALUES (?, ?)',
    [topic, JSON.stringify(envelope)]
  );
}

export async function flushOutbox(batchSize = 50) {
  if (!isKafkaConnected()) return 0;

  const [rows] = await query(
    'SELECT id, topic, envelope FROM outbox_events WHERE sent = FALSE ORDER BY created_at ASC LIMIT ?',
    [batchSize]
  );

  let flushed = 0;
  for (const row of rows) {
    try {
      const envelope = typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope;
      await produceEvent(row.topic, envelope);
      await query('UPDATE outbox_events SET sent = TRUE, sent_at = NOW() WHERE id = ?', [row.id]);
      flushed++;
    } catch {
      break;
    }
  }
  return flushed;
}

let pollInterval = null;

export function startOutboxPoller(intervalMs = 10000) {
  if (pollInterval) return;
  pollInterval = setInterval(() => flushOutbox().catch(() => {}), intervalMs);
  console.log(`[outbox] poller started (${intervalMs}ms)`);
}

export function stopOutboxPoller() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
