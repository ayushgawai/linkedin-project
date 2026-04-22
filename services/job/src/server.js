import 'dotenv/config';
import { createJobApp, createJobMySqlRepository } from './app.js';
import { connectProducer } from '../../shared/src/kafka.js';
import { startOutboxPoller } from '../../shared/src/outbox.js';

const port = Number(process.env.PORT || 8002);
const app = createJobApp({ repository: createJobMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'job', port, status: 'started' }));
  connectProducer()
    .then(() => startOutboxPoller())
    .catch(() => {});
});
