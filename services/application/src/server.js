import { createApplicationApp, createApplicationMySqlRepository } from './app.js';

const port = Number(process.env.PORT || 8003);
const app = createApplicationApp({ repository: createApplicationMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'application', port, status: 'started' }));
});
