#!/usr/bin/env node
// =============================================================================
// Synthetic data seeder for Phase 5 JMeter benchmarks.
//
// Populates MySQL (recruiters, members, jobs, job_skills, applications,
// member_skills, connections) and MongoDB (events, profile_views) with
// realistic, deterministic-ish fake data.
//
// Usage
//   node scripts/bench/seed.js                 # default sizes from env
//   node scripts/bench/seed.js --reset         # wipe everything first
//   node scripts/bench/seed.js --only=events   # regenerate just Mongo events
//   node scripts/bench/seed.js --dry            # print plan, no DB writes
//
// Env knobs (all optional — fall back to .env.example defaults)
//   BENCH_SEED_MEMBERS  (10000)
//   BENCH_SEED_JOBS     (2000)
//   BENCH_SEED_EVENTS   (200000)
//   BENCH_SEED_APPS     (25000)
//
// Designed to be idempotent & resumable:
//   - `--reset` truncates FK-sensitive tables in the right order.
//   - Without `--reset`, inserts are IGNORE-based, so re-running tops up
//     without tripping UNIQUE violations.
// =============================================================================

import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

// ----------------------------------------------------------------------------
// Config + CLI
// ----------------------------------------------------------------------------
const ARGS = new Set(process.argv.slice(2));
const OPTS = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--') && a.includes('='))
    .map((a) => a.slice(2).split('=')),
);

const CFG = {
  mysql: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'linkedin',
    database: process.env.DB_NAME || 'linkedinclone',
    multipleStatements: true,
  },
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    db: process.env.MONGO_DB || 'linkedinclone',
  },
  sizes: {
    recruiters: Number(process.env.BENCH_SEED_RECRUITERS || 200),
    members: Number(process.env.BENCH_SEED_MEMBERS || 10_000),
    jobs: Number(process.env.BENCH_SEED_JOBS || 2_000),
    applications: Number(process.env.BENCH_SEED_APPS || 25_000),
    events: Number(process.env.BENCH_SEED_EVENTS || 200_000),
    connections: Number(process.env.BENCH_SEED_CONNECTIONS || 30_000),
  },
  only: OPTS.only || null,
  reset: ARGS.has('--reset'),
  dry: ARGS.has('--dry'),
  batchSize: Number(process.env.BENCH_SEED_BATCH || 1_000),
};

// ----------------------------------------------------------------------------
// Deterministic RNG — seeded so reruns produce the same dataset
// ----------------------------------------------------------------------------
let rngState = 0xc0ffee;
function rand() {
  rngState = (rngState * 1664525 + 1013904223) % 0x100000000;
  return rngState / 0x100000000;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randint = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const uuid = () => crypto.randomUUID();

// ----------------------------------------------------------------------------
// Fixture pools
// ----------------------------------------------------------------------------
const FIRST = ['Alex', 'Priya', 'Jordan', 'Sam', 'Riya', 'Arjun', 'Ivy', 'Leo', 'Maya', 'Noah',
  'Ava', 'Ethan', 'Zara', 'Kai', 'Luna', 'Ravi', 'Tara', 'Mia', 'Omar', 'Sofia',
  'Diya', 'Aryan', 'Chloe', 'Isla', 'Yusuf', 'Anika', 'Vihaan', 'Nora', 'Rohan', 'Amelia'];
const LAST = ['Patel', 'Nguyen', 'Kim', 'Garcia', 'Brown', 'Sharma', 'Ali', 'Chen', 'Singh', 'Cohen',
  'Ivanov', 'Osei', 'Adeyemi', 'Tanaka', 'Silva', 'Gupta', 'Khan', 'Lopez', 'Fischer', 'Hoang',
  'Martin', 'Das', 'Rao', 'Iyer', 'Reddy', 'Mehta', 'Shah', 'Verma', 'Kapoor', 'Bose'];
const CITIES = [
  { city: 'San Francisco', state: 'CA' }, { city: 'New York', state: 'NY' },
  { city: 'Seattle', state: 'WA' }, { city: 'Austin', state: 'TX' },
  { city: 'Boston', state: 'MA' }, { city: 'Bangalore', state: 'KA' },
  { city: 'Hyderabad', state: 'TS' }, { city: 'Mumbai', state: 'MH' },
  { city: 'Pune', state: 'MH' }, { city: 'London', state: 'LDN' },
  { city: 'Berlin', state: 'BE' }, { city: 'Toronto', state: 'ON' },
  { city: 'Dublin', state: 'D' }, { city: 'Singapore', state: 'SG' },
  { city: 'Remote', state: 'REMOTE' },
];
const SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'Kotlin', 'C++', 'SQL',
  'React', 'Vue', 'Angular', 'Node.js', 'Express', 'FastAPI', 'Django', 'Spring',
  'Kafka', 'Redis', 'MongoDB', 'MySQL', 'Postgres', 'ElasticSearch', 'Docker',
  'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD', 'GraphQL', 'gRPC',
  'Microservices', 'Distributed Systems', 'System Design', 'Machine Learning',
  'Data Engineering', 'Product Management', 'Agile', 'Scrum',
];
const COMPANIES = ['Nimbus Labs', 'Foxtrot Systems', 'Helios AI', 'Koda Robotics',
  'BlueWave', 'Orbit Health', 'Paperclip', 'Quill Finance', 'Rally Sports', 'Sable Energy',
  'Trident Mobility', 'Umbra Games', 'Vertex Bio', 'Willow Retail', 'Xanadu Media',
  'Yellowstone Foods', 'Zenith Capital', 'Arc Logistics', 'Bastion Security', 'Cider Works'];
const INDUSTRIES = ['Software', 'Fintech', 'Healthcare', 'Robotics', 'E-commerce',
  'Media', 'Energy', 'Logistics', 'Education', 'Gaming'];
const JOB_TITLES = ['Software Engineer', 'Senior Software Engineer', 'Staff Engineer',
  'Data Engineer', 'Site Reliability Engineer', 'Frontend Engineer', 'Backend Engineer',
  'ML Engineer', 'Product Manager', 'Engineering Manager', 'DevOps Engineer',
  'Security Engineer', 'QA Engineer', 'Technical Writer', 'Mobile Engineer'];
const SENIORITY = ['internship', 'entry', 'associate', 'mid', 'senior', 'director', 'executive'];
const EMPLOYMENT = ['full_time', 'full_time', 'full_time', 'part_time', 'contract', 'internship'];
const REMOTE = ['onsite', 'remote', 'hybrid'];

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  console.log('[seed] config:', {
    mysql: `${CFG.mysql.host}:${CFG.mysql.port}/${CFG.mysql.database}`,
    mongo: CFG.mongo.uri,
    sizes: CFG.sizes,
    reset: CFG.reset,
    only: CFG.only,
    dry: CFG.dry,
  });

  if (CFG.dry) {
    console.log('[seed] --dry set: nothing will be written');
    return;
  }

  const conn = await mysql.createConnection(CFG.mysql);
  const mongoClient = new MongoClient(CFG.mongo.uri);
  await mongoClient.connect();
  const mdb = mongoClient.db(CFG.mongo.db);

  const t0 = performance.now();

  try {
    if (CFG.reset) {
      await resetAll(conn, mdb);
    }

    if (shouldRun('recruiters')) await seedRecruiters(conn);
    if (shouldRun('members'))    await seedMembers(conn);
    if (shouldRun('member_skills')) await seedMemberSkills(conn);
    if (shouldRun('jobs'))       await seedJobs(conn);
    if (shouldRun('job_skills')) await seedJobSkills(conn);
    if (shouldRun('applications')) await seedApplications(conn);
    if (shouldRun('connections')) await seedConnections(conn);
    if (shouldRun('events'))     await seedEvents(mdb, conn);
    if (shouldRun('profile_views')) await seedProfileViews(mdb, conn);

    const ms = (performance.now() - t0).toFixed(0);
    console.log(`[seed] done in ${ms}ms`);
    await printStats(conn, mdb);
  } finally {
    await conn.end();
    await mongoClient.close();
  }
}

function shouldRun(step) {
  if (!CFG.only) return true;
  return CFG.only.split(',').map((s) => s.trim()).includes(step);
}

// ----------------------------------------------------------------------------
// Reset — truncate in reverse dependency order
// ----------------------------------------------------------------------------
async function resetAll(conn, mdb) {
  console.log('[seed] --reset: truncating tables');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'outbox_events', 'processed_events',
    'application_notes', 'applications',
    'job_skills', 'jobs',
    'member_skills', 'member_experience', 'member_education',
    'connections',
    'messages', 'thread_participants', 'threads',
    'members', 'recruiters',
  ];
  for (const t of tables) {
    await conn.query(`TRUNCATE TABLE \`${t}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`[seed] truncated ${tables.length} MySQL tables`);

  const collections = ['events', 'profile_views', 'cache_metrics'];
  for (const c of collections) {
    await mdb.collection(c).deleteMany({});
  }
  console.log(`[seed] cleared ${collections.length} Mongo collections`);
}

// ----------------------------------------------------------------------------
// Recruiters
// ----------------------------------------------------------------------------
async function seedRecruiters(conn) {
  const target = CFG.sizes.recruiters;
  const [[{ existing }]] = await conn.query('SELECT COUNT(*) AS existing FROM recruiters');
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] recruiters: ${existing} already present — skipping`);
    return;
  }

  console.log(`[seed] recruiters: inserting ${need} (existing=${existing})`);
  const batch = [];
  for (let i = 0; i < need; i++) {
    const company = `${pick(COMPANIES)}-${randint(1, 99)}`;
    batch.push([
      uuid(),
      uuid(),                                                // company_id (free-form)
      `${pick(FIRST)} ${pick(LAST)}`,
      `recruiter${existing + i}_${Date.now()}@seed.local`,   // unique email
      null,
      company,
      pick(INDUSTRIES),
      pick(['1-10', '11-50', '51-200', '201-1000', '1000+']),
      'recruiter',
      'recruiter',
    ]);
  }
  await bulkInsert(
    conn,
    'INSERT IGNORE INTO recruiters (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, role, access_level) VALUES ?',
    batch,
  );
}

// ----------------------------------------------------------------------------
// Members
// ----------------------------------------------------------------------------
async function seedMembers(conn) {
  const target = CFG.sizes.members;
  const [[{ existing }]] = await conn.query('SELECT COUNT(*) AS existing FROM members');
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] members: ${existing} already present — skipping`);
    return;
  }

  console.log(`[seed] members: inserting ${need} (existing=${existing})`);
  const batch = [];
  for (let i = 0; i < need; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const city = pick(CITIES);
    batch.push([
      uuid(),
      first,
      last,
      `m_${existing + i}_${Date.now()}@seed.local`,
      null,
      `${city.city}, ${city.state}`,
      `${pick(JOB_TITLES)} @ ${pick(COMPANIES)}`,
      `Building ${pick(SKILLS)} at scale. Passionate about ${pick(SKILLS)}.`,
      null,
      randint(0, 500),
    ]);
  }
  await bulkInsert(
    conn,
    'INSERT IGNORE INTO members (member_id, first_name, last_name, email, phone, location, headline, about, profile_photo_url, connections_count) VALUES ?',
    batch,
  );
}

// ----------------------------------------------------------------------------
// Member skills — 3-6 skills per member, random
// ----------------------------------------------------------------------------
async function seedMemberSkills(conn) {
  const [rows] = await conn.query(
    'SELECT m.member_id FROM members m LEFT JOIN member_skills ms ON ms.member_id = m.member_id WHERE ms.member_id IS NULL',
  );
  if (rows.length === 0) {
    console.log('[seed] member_skills: already populated for every member');
    return;
  }
  console.log(`[seed] member_skills: filling for ${rows.length} members`);

  const batch = [];
  for (const r of rows) {
    const n = randint(3, 6);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const s = pick(SKILLS);
      if (used.has(s)) continue;
      used.add(s);
      batch.push([r.member_id, s]);
    }
  }
  await bulkInsert(conn, 'INSERT IGNORE INTO member_skills (member_id, skill) VALUES ?', batch);
}

// ----------------------------------------------------------------------------
// Jobs
// ----------------------------------------------------------------------------
async function seedJobs(conn) {
  const target = CFG.sizes.jobs;
  const [[{ existing }]] = await conn.query('SELECT COUNT(*) AS existing FROM jobs');
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] jobs: ${existing} already present — skipping`);
    return;
  }

  const [recruiters] = await conn.query('SELECT recruiter_id, company_id FROM recruiters');
  if (recruiters.length === 0) {
    throw new Error('cannot seed jobs: no recruiters exist — run recruiter step first');
  }

  console.log(`[seed] jobs: inserting ${need} (existing=${existing})`);
  const batch = [];
  const twentyDaysMs = 20 * 86_400_000;
  for (let i = 0; i < need; i++) {
    const rec = pick(recruiters);
    const title = pick(JOB_TITLES);
    const city = pick(CITIES);
    const postedAt = new Date(Date.now() - Math.floor(rand() * twentyDaysMs));
    batch.push([
      uuid(),
      rec.company_id,
      rec.recruiter_id,
      title,
      `We're hiring a ${title}. Work on ${pick(SKILLS)} / ${pick(SKILLS)} with a focus on ${pick(SKILLS)}.`,
      pick(SENIORITY),
      pick(EMPLOYMENT),
      `${city.city}, ${city.state}`,
      pick(REMOTE),
      `$${randint(60, 250)}k - $${randint(260, 450)}k`,
      rand() < 0.92 ? 'open' : 'closed',
      postedAt,
      randint(0, 2000),
      randint(0, 500),
    ]);
  }
  await bulkInsert(
    conn,
    `INSERT IGNORE INTO jobs
       (job_id, company_id, recruiter_id, title, description, seniority_level,
        employment_type, location, remote_type, salary_range, status,
        posted_datetime, views_count, applicants_count)
     VALUES ?`,
    batch,
  );
}

// ----------------------------------------------------------------------------
// Job skills — 3-8 per job
// ----------------------------------------------------------------------------
async function seedJobSkills(conn) {
  const [rows] = await conn.query(
    'SELECT j.job_id FROM jobs j LEFT JOIN job_skills js ON js.job_id = j.job_id WHERE js.job_id IS NULL',
  );
  if (rows.length === 0) {
    console.log('[seed] job_skills: already populated for every job');
    return;
  }
  console.log(`[seed] job_skills: filling for ${rows.length} jobs`);

  const batch = [];
  for (const r of rows) {
    const n = randint(3, 8);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      const s = pick(SKILLS);
      if (used.has(s)) continue;
      used.add(s);
      batch.push([r.job_id, s]);
    }
  }
  await bulkInsert(conn, 'INSERT IGNORE INTO job_skills (job_id, skill) VALUES ?', batch);
}

// ----------------------------------------------------------------------------
// Applications — UNIQUE (job_id, member_id) so we de-dup upfront
// ----------------------------------------------------------------------------
async function seedApplications(conn) {
  const target = CFG.sizes.applications;
  const [[{ existing }]] = await conn.query('SELECT COUNT(*) AS existing FROM applications');
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] applications: ${existing} already present — skipping`);
    return;
  }

  const [members] = await conn.query('SELECT member_id FROM members LIMIT 50000');
  const [jobs] = await conn.query("SELECT job_id FROM jobs WHERE status = 'open' LIMIT 10000");
  if (members.length === 0 || jobs.length === 0) {
    throw new Error('cannot seed applications: need members AND jobs first');
  }

  console.log(`[seed] applications: inserting ${need} (existing=${existing})`);
  const statuses = ['submitted', 'submitted', 'submitted', 'reviewing', 'interview', 'offer', 'rejected'];
  const seen = new Set();
  const batch = [];
  let tries = 0;
  const maxTries = need * 3;

  while (batch.length < need && tries < maxTries) {
    tries++;
    const m = pick(members).member_id;
    const j = pick(jobs).job_id;
    const k = `${j}:${m}`;
    if (seen.has(k)) continue;
    seen.add(k);
    batch.push([
      uuid(),
      j,
      m,
      null,
      `Resume text for ${m.slice(0, 8)}`,
      rand() < 0.3 ? 'I am excited about this role.' : null,
      new Date(Date.now() - Math.floor(rand() * 20 * 86_400_000)),
      pick(statuses),
    ]);
  }
  await bulkInsert(
    conn,
    `INSERT IGNORE INTO applications
       (application_id, job_id, member_id, resume_url, resume_text, cover_letter, application_datetime, status)
     VALUES ?`,
    batch,
  );
}

// ----------------------------------------------------------------------------
// Connections — random pairs, mostly accepted
// ----------------------------------------------------------------------------
async function seedConnections(conn) {
  const target = CFG.sizes.connections;
  const [[{ existing }]] = await conn.query('SELECT COUNT(*) AS existing FROM connections');
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] connections: ${existing} already present — skipping`);
    return;
  }

  const [members] = await conn.query('SELECT member_id FROM members LIMIT 20000');
  if (members.length < 2) return;

  console.log(`[seed] connections: inserting ${need} (existing=${existing})`);
  const batch = [];
  const seen = new Set();
  let tries = 0;
  const maxTries = need * 3;
  while (batch.length < need && tries < maxTries) {
    tries++;
    const a = pick(members).member_id;
    const b = pick(members).member_id;
    if (a === b) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const k = `${lo}:${hi}`;
    if (seen.has(k)) continue;
    seen.add(k);
    batch.push([uuid(), lo, hi, rand() < 0.85 ? 'accepted' : 'pending', lo]);
  }
  await bulkInsert(
    conn,
    'INSERT IGNORE INTO connections (connection_id, user_a, user_b, status, requested_by) VALUES ?',
    batch,
  );
}

// ----------------------------------------------------------------------------
// Events — Mongo. This is what drives the Phase 5 "analytics-under-load" graph.
// ----------------------------------------------------------------------------
async function seedEvents(mdb, conn) {
  const target = CFG.sizes.events;
  const existing = await mdb.collection('events').countDocuments();
  const need = Math.max(0, target - existing);
  if (need === 0) {
    console.log(`[seed] events: ${existing} already present — skipping`);
    return;
  }

  const [members] = await conn.query('SELECT member_id FROM members LIMIT 20000');
  const [jobs] = await conn.query('SELECT job_id FROM jobs LIMIT 5000');
  if (members.length === 0 || jobs.length === 0) {
    throw new Error('cannot seed events: need members + jobs first');
  }

  const eventMix = [
    ...Array(40).fill('job.viewed'),
    ...Array(15).fill('job.saved'),
    ...Array(8).fill('apply_start'),
    ...Array(10).fill('application.submitted'),
    ...Array(10).fill('connection.accepted'),
    ...Array(10).fill('connection.requested'),
    ...Array(7).fill('message.sent'),
  ];

  console.log(`[seed] events: inserting ${need} into Mongo (existing=${existing})`);
  const thirtyDaysMs = 30 * 86_400_000;
  const now = Date.now();
  const col = mdb.collection('events');

  let buffered = [];
  let written = 0;
  for (let i = 0; i < need; i++) {
    const evt = pick(eventMix);
    const job = pick(jobs).job_id;
    const member = pick(members).member_id;
    const city = pick(CITIES);
    const ts = new Date(now - Math.floor(rand() * thirtyDaysMs));

    const doc = {
      event_type: evt,
      trace_id: uuid(),
      timestamp: ts.toISOString(),
      actor_id: member,
      entity: {
        entity_type: evt.startsWith('job.') || evt.startsWith('application') || evt === 'apply_start' ? 'job' : 'member',
        entity_id: evt.startsWith('job.') || evt.startsWith('application') || evt === 'apply_start' ? job : member,
      },
      payload: evt === 'application.submitted'
        ? { job_id: job, member_id: member, member_city: city.city, member_state: city.state }
        : { job_id: job, member_id: member },
      idempotency_key: `${evt}:seed:${i}:${Date.now()}`,
      _received_at: ts,
      _source: 'seed',
    };
    buffered.push(doc);

    if (buffered.length >= CFG.batchSize) {
      await col.insertMany(buffered, { ordered: false });
      written += buffered.length;
      buffered = [];
      if (written % 20_000 === 0) console.log(`[seed]   events written: ${written}/${need}`);
    }
  }
  if (buffered.length) {
    await col.insertMany(buffered, { ordered: false });
    written += buffered.length;
  }
  console.log(`[seed] events: ${written} inserted`);
}

// ----------------------------------------------------------------------------
// Profile views — Mongo. Feeds /analytics/member/dashboard line chart.
// ----------------------------------------------------------------------------
async function seedProfileViews(mdb, conn) {
  const existing = await mdb.collection('profile_views').countDocuments();
  if (existing >= 50_000) {
    console.log(`[seed] profile_views: ${existing} already present — skipping`);
    return;
  }
  const [members] = await conn.query('SELECT member_id FROM members LIMIT 5000');
  if (members.length === 0) return;

  const target = 50_000;
  const need = target - existing;
  console.log(`[seed] profile_views: inserting ${need}`);
  const col = mdb.collection('profile_views');
  const thirtyDaysMs = 30 * 86_400_000;
  const now = Date.now();
  let buffered = [];
  for (let i = 0; i < need; i++) {
    buffered.push({
      member_id: pick(members).member_id,
      viewer_id: pick(members).member_id,
      viewed_at: new Date(now - Math.floor(rand() * thirtyDaysMs)),
    });
    if (buffered.length >= CFG.batchSize) {
      await col.insertMany(buffered, { ordered: false });
      buffered = [];
    }
  }
  if (buffered.length) await col.insertMany(buffered, { ordered: false });
}

// ----------------------------------------------------------------------------
// Stats
// ----------------------------------------------------------------------------
async function printStats(conn, mdb) {
  const tables = ['recruiters', 'members', 'member_skills', 'jobs', 'job_skills',
    'applications', 'connections'];
  const rowCounts = {};
  for (const t of tables) {
    const [[row]] = await conn.query(`SELECT COUNT(*) AS c FROM ${t}`);
    rowCounts[t] = Number(row.c);
  }
  const collections = ['events', 'profile_views', 'cache_metrics'];
  const docCounts = {};
  for (const c of collections) {
    docCounts[c] = await mdb.collection(c).countDocuments();
  }
  console.log('[seed] stats mysql:', rowCounts);
  console.log('[seed] stats mongo:', docCounts);
  return { mysql: rowCounts, mongo: docCounts };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
async function bulkInsert(conn, sql, rows) {
  if (rows.length === 0) return;
  const batches = chunk(rows, CFG.batchSize);
  for (const b of batches) {
    await conn.query(sql, [b]);
  }
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Exported so the HTTP /benchmark/seed handler can invoke the same code path.
export async function runSeeder({ sizes = {}, reset = false, only = null } = {}) {
  if (sizes && typeof sizes === 'object') Object.assign(CFG.sizes, sizes);
  CFG.reset = !!reset;
  CFG.only = only || null;
  CFG.dry = false;

  const conn = await mysql.createConnection(CFG.mysql);
  const mongoClient = new MongoClient(CFG.mongo.uri);
  await mongoClient.connect();
  const mdb = mongoClient.db(CFG.mongo.db);
  const t0 = performance.now();

  try {
    if (CFG.reset) await resetAll(conn, mdb);
    if (shouldRun('recruiters')) await seedRecruiters(conn);
    if (shouldRun('members')) await seedMembers(conn);
    if (shouldRun('member_skills')) await seedMemberSkills(conn);
    if (shouldRun('jobs')) await seedJobs(conn);
    if (shouldRun('job_skills')) await seedJobSkills(conn);
    if (shouldRun('applications')) await seedApplications(conn);
    if (shouldRun('connections')) await seedConnections(conn);
    if (shouldRun('events')) await seedEvents(mdb, conn);
    if (shouldRun('profile_views')) await seedProfileViews(mdb, conn);
    const stats = await printStats(conn, mdb);
    return { duration_ms: Math.round(performance.now() - t0), stats };
  } finally {
    await conn.end();
    await mongoClient.close();
  }
}

// Only run main when invoked as a CLI (not on import)
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((err) => {
    console.error('[seed] fatal:', err);
    process.exit(1);
  });
}
