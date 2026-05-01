import express from 'express';

import { createProfileApp } from '../../services/profile/src/member1-memory-app.js';
import { createJobApp } from '../../services/job/src/member1-memory-app.js';
import { createApplicationApp } from '../../services/application/src/app.js';

import {
  createApplicationMemoryRepository,
  createJobMemoryRepository,
  createProfileMemoryRepository
} from '../../services/shared/src/memory.js';

function listen(app, port, name) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(JSON.stringify({ service: name, port, status: 'started' }));
      resolve(server);
    });
  });
}

async function main() {
  const profileRepo = createProfileMemoryRepository();
  const applicationRepo = createApplicationMemoryRepository({
    jobs: [{ job_id: 'job-seed-1', status: 'open' }],
    members: [{ member_id: 'member-seed-1' }]
  });

  // Seed: ensure we have at least one recruiter so /jobs/create works immediately.
  const seededRecruiter = await profileRepo.createRecruiter({
    email: 'recruiter@example.com',
    password: 'dev',
    full_name: 'Recruiter One',
    company_name: 'Nimbus Labs',
    company_industry: 'Software',
    company_size: '51-200 employees'
  });

  // Seed: also create a default member so application submit works immediately.
  const seededMember = await profileRepo.createMember({
    first_name: 'Member',
    last_name: 'Seed',
    email: 'member@example.com',
    phone: null,
    location: 'San Jose, CA',
    headline: 'Software Engineer',
    about: null,
    profile_photo_url: null,
    skills: ['Node.js'],
    experience: [],
    education: []
  });

  const jobRepoSeeded = createJobMemoryRepository({
    recruiters: [{
      recruiter_id: seededRecruiter.recruiter_id,
      company_id: seededRecruiter.company_id,
      company_industry: seededRecruiter.company_industry || 'Software'
    }]
  });

  const profileApp = createProfileApp({ repository: profileRepo });
  const jobApp = createJobApp({ repository: jobRepoSeeded });
  const applicationApp = createApplicationApp({ repository: applicationRepo });

  // Convenience "root" app that exposes each service health in one place.
  const root = express();
  root.get('/health', (_req, res) => res.json({ status: 'ok', stack: 'memory' }));

  await listen(profileApp, 8001, 'profile-memory');
  await listen(jobApp, 8002, 'job-memory');
  await listen(applicationApp, 8003, 'application-memory');
  await listen(root, 8010, 'memory-root');

  console.log(JSON.stringify({
    seeded: {
      recruiter_id: seededRecruiter.recruiter_id,
      member_id: seededMember.member_id
    }
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

