import 'dotenv/config';
import { createProfileApp, createProfileMySqlRepository } from './app.js';

const port = Number(process.env.PORT || 8001);
const app = createProfileApp({ repository: createProfileMySqlRepository() });

app.listen(port, () => {
  console.log(JSON.stringify({ service: 'profile', port, status: 'started' }));
});
