import { getKafkaInstance } from './kafka.js';

export function createConsumer(groupId, handlers) {
  const kafka = getKafkaInstance();
  const consumer = kafka.consumer({ groupId });

  async function start() {
    await consumer.connect();
    const topics = Object.keys(handlers);
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    console.log(`[kafka-consumer] ${groupId} subscribed to: ${topics.join(', ')}`);

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const handler = handlers[topic];
        if (!handler) return;
        try {
          const envelope = JSON.parse(message.value.toString());
          await handler(envelope);
        } catch (err) {
          console.error(`[kafka-consumer] error processing ${topic}:`, err.message);
        }
      }
    });
  }

  async function stop() {
    await consumer.disconnect();
  }

  return { start, stop };
}
