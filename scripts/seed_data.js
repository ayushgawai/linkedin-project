#!/usr/bin/env node
/**
 * Seed loader — inserts demo data into MySQL for local development and testing.
 * Re-runnable: skips rows that already exist (uses INSERT IGNORE).
 *
 * Usage:  node scripts/seed_data.js
 * Requires: .env at repo root with DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'linkedin',
  database: process.env.DB_NAME || 'linkedinclone',
  waitForConnections: true,
  connectionLimit: 5,
});

const SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++',
  'React', 'Angular', 'Vue', 'Node.js', 'Express', 'FastAPI', 'Django',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka', 'RabbitMQ',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform',
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision',
  'REST API', 'GraphQL', 'gRPC', 'Microservices', 'CI/CD', 'Git',
];

const LOCATIONS = [
  'San Jose, CA', 'San Francisco, CA', 'New York, NY', 'Seattle, WA',
  'Austin, TX', 'Chicago, IL', 'Los Angeles, CA', 'Boston, MA',
  'Denver, CO', 'Portland, OR', 'Miami, FL', 'Atlanta, GA',
];

const COMPANIES = [
  { name: 'TechFlow Inc', industry: 'Technology', size: '500-1000' },
  { name: 'DataWave Labs', industry: 'Data Analytics', size: '100-500' },
  { name: 'CloudPeak Systems', industry: 'Cloud Computing', size: '1000-5000' },
  { name: 'NeuralPath AI', industry: 'Artificial Intelligence', size: '50-200' },
  { name: 'CyberGuard Pro', industry: 'Cybersecurity', size: '200-500' },
  { name: 'FinEdge Solutions', industry: 'Financial Technology', size: '500-1000' },
  { name: 'GreenScale Energy', industry: 'Clean Tech', size: '100-500' },
  { name: 'HealthBridge Labs', industry: 'Healthcare Tech', size: '200-1000' },
  { name: 'EduNova Platform', industry: 'EdTech', size: '50-200' },
  { name: 'UrbanLogix', industry: 'Logistics', size: '500-2000' },
];

const SENIORITY = ['internship', 'entry', 'associate', 'mid', 'senior', 'director'];
const EMPLOYMENT = ['full_time', 'part_time', 'contract', 'internship'];
const REMOTE = ['onsite', 'remote', 'hybrid'];
const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Hank',
  'Iris', 'Jack', 'Karen', 'Leo', 'Mona', 'Nate', 'Olivia', 'Peter',
  'Quinn', 'Rachel', 'Steve', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zach', 'Amara', 'Brian', 'Chloe', 'Derek', 'Elena', 'Finn',
  'Gina', 'Hugo', 'Ivy', 'James', 'Kira', 'Liam', 'Maya', 'Noah',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark',
  'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King',
  'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}
function uuid() { return crypto.randomUUID(); }

async function seed() {
  console.log('Seeding database...\n');

  // --- Members (120) ---
  const memberIds = [];
  const memberEmails = new Set();
  const memberRows = [];
  for (let i = 0; i < 120; i++) {
    const id = uuid();
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    let email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
    while (memberEmails.has(email)) email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}r@example.com`;
    memberEmails.add(email);
    memberIds.push(id);
    memberRows.push([id, fn, ln, email, `555-${String(i).padStart(4, '0')}`, pick(LOCATIONS),
      `${pick(SENIORITY)} ${pick(SKILLS)} Developer`, `Passionate about ${pick(SKILLS)} and ${pick(SKILLS)}.`]);
  }
  const memberSql = `INSERT IGNORE INTO members (member_id, first_name, last_name, email, phone, location, headline, about) VALUES ?`;
  const [mr] = await pool.query(memberSql, [memberRows]);
  console.log(`Members: ${mr.affectedRows} inserted (${memberRows.length} attempted)`);

  // Member skills (3-6 per member)
  const skillRows = [];
  for (const mid of memberIds) {
    for (const s of pickN(SKILLS, 3 + Math.floor(Math.random() * 4))) {
      skillRows.push([mid, s]);
    }
  }
  const [sr] = await pool.query('INSERT IGNORE INTO member_skills (member_id, skill) VALUES ?', [skillRows]);
  console.log(`Member skills: ${sr.affectedRows} inserted`);

  // --- Recruiters (20) ---
  const recruiterIds = [];
  const recruiterRows = [];
  for (let i = 0; i < 20; i++) {
    const id = uuid();
    const co = COMPANIES[i % COMPANIES.length];
    const companyId = uuid();
    recruiterIds.push({ recruiter_id: id, company_id: companyId });
    recruiterRows.push([id, companyId, `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      `recruiter${i}@${co.name.toLowerCase().replace(/\s/g, '')}.com`,
      co.name, co.industry, co.size]);
  }
  const recSql = `INSERT IGNORE INTO recruiters (recruiter_id, company_id, name, email, company_name, company_industry, company_size) VALUES ?`;
  const [rr] = await pool.query(recSql, [recruiterRows]);
  console.log(`Recruiters: ${rr.affectedRows} inserted`);

  // --- Jobs (150) ---
  const JOB_TITLES = [
    'Backend Engineer', 'Frontend Developer', 'Full Stack Engineer',
    'Data Scientist', 'ML Engineer', 'DevOps Engineer',
    'Product Manager', 'Security Engineer', 'Mobile Developer',
    'Cloud Architect', 'SRE', 'QA Engineer', 'Data Engineer',
    'AI Research Scientist', 'Platform Engineer',
  ];

  const jobIds = [];
  const jobRows = [];
  const jobSkillRows = [];
  for (let i = 0; i < 150; i++) {
    const id = uuid();
    const rec = pick(recruiterIds);
    const title = `${pick(SENIORITY).replace(/^\w/, c => c.toUpperCase())} ${pick(JOB_TITLES)}`;
    jobIds.push(id);
    jobRows.push([id, rec.company_id, rec.recruiter_id, title,
      `We are looking for a ${title} to join our team. You will work on ${pick(SKILLS)} and ${pick(SKILLS)} projects.`,
      pick(SENIORITY), pick(EMPLOYMENT), pick(LOCATIONS), pick(REMOTE),
      `$${80 + Math.floor(Math.random() * 120)}k - $${150 + Math.floor(Math.random() * 100)}k`,
      'open']);
    for (const s of pickN(SKILLS, 2 + Math.floor(Math.random() * 4))) {
      jobSkillRows.push([id, s]);
    }
  }
  const jobSql = `INSERT IGNORE INTO jobs (job_id, company_id, recruiter_id, title, description, seniority_level, employment_type, location, remote_type, salary_range, status) VALUES ?`;
  const [jr] = await pool.query(jobSql, [jobRows]);
  console.log(`Jobs: ${jr.affectedRows} inserted`);
  const [jsr] = await pool.query('INSERT IGNORE INTO job_skills (job_id, skill) VALUES ?', [jobSkillRows]);
  console.log(`Job skills: ${jsr.affectedRows} inserted`);

  // --- Applications (500) ---
  const appRows = [];
  const appPairs = new Set();
  let attempts = 0;
  while (appRows.length < 500 && attempts < 2000) {
    attempts++;
    const jid = pick(jobIds);
    const mid = pick(memberIds);
    const key = `${jid}:${mid}`;
    if (appPairs.has(key)) continue;
    appPairs.add(key);
    appRows.push([uuid(), jid, mid, null, null, null, pick(['submitted', 'reviewing', 'interview', 'offer', 'rejected'])]);
  }
  const appSql = `INSERT IGNORE INTO applications (application_id, job_id, member_id, resume_url, resume_text, cover_letter, status) VALUES ?`;
  const [ar] = await pool.query(appSql, [appRows]);
  console.log(`Applications: ${ar.affectedRows} inserted (${appRows.length} attempted)`);

  // Update applicants_count on jobs
  await pool.query(`UPDATE jobs j SET applicants_count = (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.job_id)`);
  console.log('Jobs applicants_count updated');

  console.log('\nSeed complete!');
  await pool.end();
}

seed().catch((e) => { console.error(e); process.exit(1); });
