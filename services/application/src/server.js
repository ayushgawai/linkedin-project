import 'dotenv/config';
import { createApplicationApp, createApplicationMySqlRepository } from './app.js';
import { connectProducer } from '../../shared/src/kafka.js';
import { startOutboxPoller } from '../../shared/src/outbox.js';
import { execute } from '../../shared/src/mysql.js';

const port = Number(process.env.PORT || 8003);
const app = createApplicationApp({ repository: createApplicationMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'application', port, status: 'started' }));
  // One-time lightweight migration to support frontend resume uploads (base64 data URLs).
  // Fresh volumes use data/schema.sql; this keeps existing dev volumes compatible.
  execute('ALTER TABLE applications MODIFY resume_text MEDIUMTEXT').catch(() => {});
  connectProducer()
    .then(() => startOutboxPoller())
    .catch(() => {});
});
