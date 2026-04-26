import 'dotenv/config';
import { createApplicationApp, createApplicationMySqlRepository } from './app.js';
import { connectProducer } from '../../shared/src/kafka.js';
import { startOutboxPoller } from '../../shared/src/outbox.js';

const port = Number(process.env.PORT || 8003);
const app = createApplicationApp({ repository: createApplicationMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'application', port, status: 'started' }));
  connectProducer()
    .then(() => startOutboxPoller())
    .catch(() => {});
});
