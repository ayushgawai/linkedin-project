import test from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';

import { createProfileApp } from '../services/profile/src/app.js';
import { createJobApp } from '../services/job/src/app.js';
import { createApplicationApp } from '../services/application/src/app.js';
import {
  createApplicationMemoryRepository,
  createJobMemoryRepository,
  createProfileMemoryRepository
} from '../services/shared/src/memory.js';

test('profile service creates, retrieves, updates, searches, and deletes a member', async () => {
  const repository = createProfileMemoryRepository();
  const app = createProfileApp({ repository });

  const createResponse = await request(app)
    .post('/members/create')
    .send({
      first_name: 'Ayush',
      last_name: 'Gawai',
      email: 'ayush@example.com',
      phone: '+1-555-0101',
      location: 'San Jose, CA',
      headline: 'Backend Engineer',
      about: 'Distributed systems builder',
      skills: ['Node.js', 'Kafka', 'Node.js'],
      experience: [{ company: 'LinkedInClone', title: 'Engineer', is_current: true }],
      education: [{ institution: 'SJSU', degree: 'MS', end_year: 2026 }]
    })
    .expect(201);

  assert.equal(createResponse.body.success, true);
  assert.equal(createResponse.body.data.skills.length, 2);
  const memberId = createResponse.body.data.member_id;

  const getResponse = await request(app).post('/members/get').send({ member_id: memberId }).expect(200);
  assert.equal(getResponse.body.data.email, 'ayush@example.com');

  const updateResponse = await request(app)
    .post('/members/update')
    .send({ member_id: memberId, headline: 'Lead Backend Engineer', skills: ['Node.js', 'MySQL'] })
    .expect(200);
  assert.equal(updateResponse.body.data.headline, 'Lead Backend Engineer');
  assert.deepEqual(updateResponse.body.data.skills, ['Node.js', 'MySQL']);

  const searchResponse = await request(app)
    .post('/members/search')
    .send({ keyword: 'backend', skill: 'mysql', page: 1, page_size: 10 })
    .expect(200);
  assert.equal(searchResponse.body.data.total, 1);

  await request(app).post('/members/delete').send({ member_id: memberId }).expect(200);
  await request(app).post('/members/get').send({ member_id: memberId }).expect(404);
});

test('profile service rejects duplicate emails', async () => {
  const repository = createProfileMemoryRepository();
  const app = createProfileApp({ repository });

  const payload = {
    first_name: 'Ayush',
    last_name: 'Gawai',
    email: 'duplicate@example.com'
  };

  await request(app).post('/members/create').send(payload).expect(201);
  const duplicate = await request(app).post('/members/create').send(payload).expect(409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_EMAIL');
});

test('job service enforces recruiter existence, search, close, and recruiter listing', async () => {
  const repository = createJobMemoryRepository({
    recruiters: [{
      recruiter_id: 'recruiter-1',
      company_id: 'company-1',
      company_industry: 'software'
    }]
  });
  const app = createJobApp({ repository });

  await request(app)
    .post('/jobs/create')
    .send({
      company_id: 'company-1',
      recruiter_id: 'missing',
      title: 'Backend Engineer',
      description: 'Own APIs',
      seniority_level: 'mid',
      employment_type: 'full_time',
      remote_type: 'hybrid',
      status: 'open'
    })
    .expect(404);

  const createResponse = await request(app)
    .post('/jobs/create')
    .send({
      company_id: 'company-1',
      recruiter_id: 'recruiter-1',
      title: 'Backend Engineer',
      description: 'Own APIs and Kafka pipelines',
      seniority_level: 'mid',
      employment_type: 'full_time',
      location: 'San Jose, CA',
      remote_type: 'hybrid',
      skills_required: ['Node.js', 'Kafka'],
      salary_range: '$120k-$160k',
      status: 'open'
    })
    .expect(201);

  const jobId = createResponse.body.data.job_id;

  const searchResponse = await request(app)
    .post('/jobs/search')
    .send({ keyword: 'Kafka', industry: 'software', page: 1, page_size: 10 })
    .expect(200);
  assert.equal(searchResponse.body.data.total, 1);

  const byRecruiter = await request(app)
    .post('/jobs/byRecruiter')
    .send({ recruiter_id: 'recruiter-1', page: 1, page_size: 10 })
    .expect(200);
  assert.equal(byRecruiter.body.data.results[0].job_id, jobId);

  await request(app).post('/jobs/close').send({ job_id: jobId }).expect(200);
  const alreadyClosed = await request(app).post('/jobs/close').send({ job_id: jobId }).expect(409);
  assert.equal(alreadyClosed.body.error.code, 'ALREADY_CLOSED');
});

test('application service validates submit, listing, notes, and status transitions', async () => {
  const repository = createApplicationMemoryRepository({
    jobs: [{ job_id: 'job-1', status: 'open' }, { job_id: 'job-2', status: 'closed' }],
    members: [{ member_id: 'member-1' }, { member_id: 'member-2' }]
  });
  const app = createApplicationApp({ repository });

  await request(app)
    .post('/applications/submit')
    .send({ job_id: 'job-404', member_id: 'member-1' })
    .expect(404);

  await request(app)
    .post('/applications/submit')
    .send({ job_id: 'job-2', member_id: 'member-1' })
    .expect(409);

  const submitResponse = await request(app)
    .post('/applications/submit')
    .send({
      job_id: 'job-1',
      member_id: 'member-1',
      resume_text: 'Node.js Kafka MySQL',
      cover_letter: 'Interested in the role',
      answers: { visa: 'yes' }
    })
    .expect(201);

  const applicationId = submitResponse.body.data.application_id;

  await request(app)
    .post('/applications/submit')
    .send({ job_id: 'job-1', member_id: 'member-1' })
    .expect(409);

  const getResponse = await request(app)
    .post('/applications/get')
    .send({ application_id: applicationId })
    .expect(200);
  assert.equal(getResponse.body.data.status, 'submitted');

  await request(app)
    .post('/applications/updateStatus')
    .send({ application_id: applicationId, status: 'offer' })
    .expect(400);

  await request(app)
    .post('/applications/updateStatus')
    .send({ application_id: applicationId, status: 'reviewing', note: 'Strong resume' })
    .expect(200);

  const noteResponse = await request(app)
    .post('/applications/addNote')
    .send({ application_id: applicationId, recruiter_id: 'recruiter-1', note_text: 'Schedule interview' })
    .expect(200);
  assert.ok(noteResponse.body.data.note_id);

  const byJob = await request(app)
    .post('/applications/byJob')
    .send({ job_id: 'job-1', page: 1, page_size: 10 })
    .expect(200);
  assert.equal(byJob.body.data.total, 1);

  const byMember = await request(app)
    .post('/applications/byMember')
    .send({ member_id: 'member-1', page: 1, page_size: 10 })
    .expect(200);
  assert.equal(byMember.body.data.results[0].application_id, applicationId);
});
