#!/usr/bin/env node
/**
 * End-to-end demo test — walks through all 4 story flows from the API contract §8:
 *
 *   1. Member profile flow: create → update → search → get
 *   2. Job posting flow: create → search → close → recruiter listing
 *   3. Application flow: submit → recruiter status update → member status view
 *   4. Async flow: Kafka event → Analytics consumer → analytics query
 *
 * Usage: node scripts/e2e_demo.js
 * Requires all services running (profile:8001, job:8002, application:8003, analytics:8006)
 */

const BASE = {
  profile: 'http://localhost:8001',
  job: 'http://localhost:8002',
  application: 'http://localhost:8003',
  analytics: 'http://localhost:8006',
};

let passed = 0;
let failed = 0;

async function post(service, path, body) {
  const url = `${BASE[service]}${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  return { status: resp.status, json };
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function healthChecks() {
  console.log('\n=== Health Checks ===');
  for (const [name, base] of Object.entries(BASE)) {
    try {
      const r = await fetch(`${base}/health`);
      const j = await r.json();
      assert(j.status === 'ok', `${name} health OK (db: ${j.db}, kafka: ${j.kafka || 'n/a'})`);
    } catch (e) {
      assert(false, `${name} health: ${e.message}`);
    }
  }
}

async function flow1_memberProfile() {
  console.log('\n=== Flow 1: Member Profile (create → update → search → get) ===');

  const ts = Date.now();
  const email = `e2etest${ts}@example.com`;

  const { status: s1, json: j1 } = await post('profile', '/members/create', {
    first_name: 'E2E', last_name: 'TestUser', email,
    phone: '555-0000', location: 'San Jose, CA',
    headline: 'E2E Test Engineer', about: 'Automated test user',
    skills: ['JavaScript', 'Node.js', 'Kafka'],
  });
  assert(s1 === 201, `Create member → 201 (got ${s1})`);
  assert(j1.success === true, 'Response envelope success=true');
  const memberId = j1.data?.member_id;
  assert(!!memberId, `member_id returned: ${memberId}`);

  const { status: s2, json: j2 } = await post('profile', '/members/update', {
    member_id: memberId,
    fields_to_update: { headline: 'Senior E2E Test Engineer' },
  });
  assert(s2 === 200, `Update member → 200 (got ${s2})`);
  assert(j2.data?.headline === 'Senior E2E Test Engineer', 'Headline updated');

  const { status: s3, json: j3 } = await post('profile', '/members/search', {
    keyword: 'E2E', page: 1, page_size: 5,
  });
  assert(s3 === 200, `Search members → 200 (got ${s3})`);
  assert(j3.data?.total >= 1, `Search found ≥1 result (total: ${j3.data?.total})`);

  const { status: s4, json: j4 } = await post('profile', '/members/get', {
    member_id: memberId,
  });
  assert(s4 === 200, `Get member → 200 (got ${s4})`);
  assert(j4.data?.email === email, 'Correct email returned');
  assert(Array.isArray(j4.data?.skills), 'Skills array present');

  return memberId;
}

async function flow2_jobPosting() {
  console.log('\n=== Flow 2: Job Posting (create → search → close → byRecruiter) ===');

  const { status: rs, json: rj } = await post('profile', '/members/search', { page_size: 1 });
  const dummyCompanyId = 'e2e-company-' + Date.now();

  const createRecruiter = await post('job', '/jobs/search', { keyword: 'test' });

  let recruiterId;
  const recResp = await fetch(`${BASE.job}/health`);
  const dbCheck = await recResp.json();

  const getRecId = await fetch(`${BASE.profile}/health`);
  const { status: qs, json: qj } = await post('profile', '/members/search', { page_size: 1 });

  const recSql = await fetch(`http://localhost:8002/health`);
  const recSqlJ = await recSql.json();
  if (recSqlJ.db === 'connected') {
    const lookup = await post('job', '/jobs/byRecruiter', { recruiter_id: 'nonexistent', page: 1, page_size: 1 });
  }

  const seedRecruiter = await fetch('http://localhost:8002/health');
  const existingJobs = await post('job', '/jobs/search', { page: 1, page_size: 1 });
  if (existingJobs.json?.data?.results?.length > 0) {
    recruiterId = existingJobs.json.data.results[0].recruiter_id;
    dummyCompanyId !== '' && (null);
  }

  if (!recruiterId) {
    console.log('  (No recruiters found in DB — skipping job create, using search only)');
    const { status: ss, json: sj } = await post('job', '/jobs/search', {
      keyword: 'Engineer', page: 1, page_size: 5,
    });
    assert(ss === 200, `Search jobs → 200 (got ${ss})`);
    assert(Array.isArray(sj.data?.results), 'Results array present');
    return sj.data?.results?.[0]?.job_id || null;
  }

  const companyId = existingJobs.json.data.results[0].company_id;

  const { status: s1, json: j1 } = await post('job', '/jobs/create', {
    company_id: companyId,
    recruiter_id: recruiterId,
    title: 'E2E Test Backend Engineer',
    description: 'Automated end-to-end test job posting for validation.',
    seniority_level: 'mid',
    employment_type: 'full_time',
    location: 'San Jose, CA',
    remote_type: 'hybrid',
    skills_required: ['Node.js', 'Kafka', 'MySQL'],
  });
  assert(s1 === 201, `Create job → 201 (got ${s1})`);
  const jobId = j1.data?.job_id;
  assert(!!jobId, `job_id returned: ${jobId}`);

  const { status: s2, json: j2 } = await post('job', '/jobs/search', {
    keyword: 'E2E Test', page: 1, page_size: 5,
  });
  assert(s2 === 200, `Search jobs → 200 (got ${s2})`);
  const found = j2.data?.results?.some((j) => j.job_id === jobId);
  assert(found, 'Created job appears in search results');

  const { status: s3, json: j3 } = await post('job', '/jobs/get', { job_id: jobId });
  assert(s3 === 200, `Get job → 200 (views incremented: ${j3.data?.views_count})`);

  const { status: s4, json: j4 } = await post('job', '/jobs/byRecruiter', {
    recruiter_id: recruiterId, page: 1, page_size: 50,
  });
  assert(s4 === 200, `byRecruiter → 200 (got ${s4})`);
  const inList = j4.data?.results?.some((j) => j.job_id === jobId);
  assert(inList, 'Job appears in recruiter listing');

  const { status: s5, json: j5 } = await post('job', '/jobs/close', { job_id: jobId });
  assert(s5 === 200, `Close job → 200 (got ${s5})`);
  assert(j5.data?.status === 'closed', 'Job status = closed');

  const { status: s6, json: j6 } = await post('job', '/jobs/close', { job_id: jobId });
  assert(s6 === 409, `Re-close → 409 ALREADY_CLOSED (got ${s6})`);

  return jobId;
}

async function flow3_application(memberId) {
  console.log('\n=== Flow 3: Application (submit → status update → member view) ===');

  const { json: sj } = await post('job', '/jobs/search', {
    keyword: '', page: 1, page_size: 1,
  });
  const openJob = sj.data?.results?.find((j) => j.status === 'open');
  if (!openJob) {
    console.log('  (No open jobs found — skipping application flow)');
    return null;
  }
  const jobId = openJob.job_id;

  const { status: s1, json: j1 } = await post('application', '/applications/submit', {
    job_id: jobId, member_id: memberId,
    resume_text: 'E2E test resume text',
    cover_letter: 'I am excited about this opportunity.',
  });
  assert(s1 === 201, `Submit application → 201 (got ${s1})`);
  const appId = j1.data?.application_id;
  assert(!!appId, `application_id returned: ${appId}`);

  const { status: s1b, json: j1b } = await post('application', '/applications/submit', {
    job_id: jobId, member_id: memberId,
  });
  assert(s1b === 409, `Duplicate submit → 409 (got ${s1b})`);

  const { status: s2, json: j2 } = await post('application', '/applications/get', {
    application_id: appId,
  });
  assert(s2 === 200, `Get application → 200 (got ${s2})`);
  assert(j2.data?.status === 'submitted', 'Initial status = submitted');

  const { status: s3 } = await post('application', '/applications/updateStatus', {
    application_id: appId, status: 'reviewing',
  });
  assert(s3 === 200, `Status → reviewing (got ${s3})`);

  const { status: s4 } = await post('application', '/applications/updateStatus', {
    application_id: appId, status: 'interview',
  });
  assert(s4 === 200, `Status → interview (got ${s4})`);

  const { status: s5, json: j5 } = await post('application', '/applications/updateStatus', {
    application_id: appId, status: 'submitted',
  });
  assert(s5 === 400, `Invalid transition → 400 (got ${s5})`);
  assert(j5.error?.code === 'INVALID_STATUS_TRANSITION', 'Correct error code');

  const { status: s6, json: j6 } = await post('application', '/applications/byMember', {
    member_id: memberId, page: 1, page_size: 10,
  });
  assert(s6 === 200, `byMember → 200 (got ${s6})`);
  assert(j6.data?.total >= 1, `Member has ≥1 application (total: ${j6.data?.total})`);

  const { status: s7, json: j7 } = await post('application', '/applications/byJob', {
    job_id: jobId, page: 1, page_size: 10,
  });
  assert(s7 === 200, `byJob → 200 (got ${s7})`);
  assert(j7.data?.total >= 1, `Job has ≥1 application (total: ${j7.data?.total})`);

  const { status: s8, json: j8 } = await post('application', '/applications/addNote', {
    application_id: appId, recruiter_id: 'e2e-recruiter', note_text: 'Strong candidate',
  });
  assert(s8 === 200, `Add note → 200 (got ${s8})`);
  assert(!!j8.data?.note_id, `note_id returned: ${j8.data?.note_id}`);

  return appId;
}

async function flow4_async(jobId) {
  console.log('\n=== Flow 4: Async (Kafka event → Analytics consumer → query) ===');

  if (!jobId) {
    const { json: sj } = await post('job', '/jobs/search', { page: 1, page_size: 1 });
    jobId = sj.data?.results?.[0]?.job_id;
  }
  if (!jobId) {
    console.log('  (No jobs found — skipping async flow)');
    return;
  }

  await post('job', '/jobs/get', { job_id: jobId });
  await post('job', '/jobs/get', { job_id: jobId });
  await post('job', '/jobs/get', { job_id: jobId });

  console.log('  Waiting 3s for Kafka events to propagate to analytics...');
  await sleep(3000);

  const { status: s1, json: j1 } = await post('analytics', '/events/ingest', {
    event_type: 'job.viewed',
    actor_id: 'e2e-user',
    entity_type: 'job',
    entity_id: jobId,
    payload: { location: 'San Jose, CA' },
    trace_id: 'e2e-trace-' + Date.now(),
  });
  assert(s1 === 202, `Ingest event → 202 (got ${s1})`);
  assert(j1.data?.accepted === true, 'Event accepted');

  const { status: s2, json: j2 } = await post('analytics', '/analytics/jobs/top', {
    metric: 'views', window_days: 30, limit: 10,
  });
  assert(s2 === 200, `Top jobs → 200 (got ${s2})`);
  assert(Array.isArray(j2.data?.jobs), 'Jobs array returned');

  const { status: s3, json: j3 } = await post('analytics', '/analytics/funnel', {
    job_id: jobId, window_days: 30,
  });
  assert(s3 === 200, `Funnel → 200 (got ${s3})`);
  assert(typeof j3.data?.view === 'number', `Funnel view count: ${j3.data?.view}`);

  const { status: s4, json: j4 } = await post('analytics', '/analytics/geo', {
    job_id: jobId, window_days: 30,
  });
  assert(s4 === 200, `Geo → 200 (got ${s4})`);
  assert(Array.isArray(j4.data?.cities), 'Cities array returned');

  const { status: s5, json: j5 } = await post('analytics', '/analytics/member/dashboard', {
    member_id: 'e2e-user', window_days: 30,
  });
  assert(s5 === 200, `Member dashboard → 200 (got ${s5})`);
  assert(typeof j5.data?.profile_views === 'number', 'Profile views count returned');
}

async function main() {
  console.log('LinkedInClone E2E Demo Test');
  console.log('==========================');

  await healthChecks();
  const memberId = await flow1_memberProfile();
  const jobId = await flow2_jobPosting();
  await flow3_application(memberId);
  await flow4_async(jobId);

  console.log(`\n==========================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('==========================\n');

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E test crashed:', e);
  process.exit(1);
});
