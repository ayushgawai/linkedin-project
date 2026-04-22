import { Kafka, logLevel } from 'kafkajs';
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
  retry: { retries: 3, initialRetryTime: 500, maxRetryTime: 10000 },
});

/**
 * Creates a Kafka consumer that subscribes to the given topics and processes
 * each message through the provided handler map.
 *
 * @param {string} groupId - Consumer group ID
 * @param {Object<string, function>} handlers - Map of topic → async handler(envelope)
 * @returns {{ start: function, stop: function, isRunning: function }}
 */
export function createConsumer(groupId, handlers) {
  const consumer = kafka.consumer({ groupId });
  let running = false;

  async function start() {
    try {
      await consumer.connect();
      for (const topic of Object.keys(handlers)) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }
      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          const handler = handlers[topic];
          if (!handler) return;
          try {
            const envelope = JSON.parse(message.value.toString());
            await handler(envelope);
          } catch (e) {
            console.error(`[consumer:${groupId}] Error processing ${topic}:`, e.message);
          }
        },
      });
      running = true;
      console.log(`[consumer:${groupId}] started — topics: ${Object.keys(handlers).join(', ')}`);
    } catch (e) {
      console.error(`[consumer:${groupId}] Failed to start:`, e.message);
    }
  }

  async function stop() {
    try {
      await consumer.disconnect();
    } catch { /* ignore */ }
    running = false;
  }

  return { start, stop, isRunning: () => running };
}
