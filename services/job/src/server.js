import { createJobApp, createJobMySqlRepository } from './app.js';

const port = Number(process.env.PORT || 8002);
const app = createJobApp({ repository: createJobMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'job', port, status: 'started' }));
});
