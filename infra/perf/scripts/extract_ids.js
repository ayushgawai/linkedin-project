#!/usr/bin/env node
// Extract seeded IDs from MySQL into CSVs the JMeter plans consume.
// Keeps the JMX files generic — re-seed → re-run this → JMeter rolls over
// a fresh working set without editing the plans.
//
// Usage:  node infra/perf/scripts/extract_ids.js

import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const CFG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'linkedin',
  database: process.env.DB_NAME || 'linkedinclone',
};

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const SEARCH_KEYWORDS = [
  'Engineer', 'Senior', 'Staff', 'Data', 'Frontend', 'Backend', 'DevOps',
  'ML', 'Mobile', 'Product', 'Security', 'SRE', 'Engineering Manager',
  'Java', 'Python', 'TypeScript', 'Redis', 'Kafka', 'Microservices',
];

async function main() {
  console.log('[extract] connecting to MySQL', `${CFG.host}:${CFG.port}/${CFG.database}`);
  const conn = await mysql.createConnection(CFG);
  try {
    await writeCsv(
      conn,
      'member_ids.csv',
      'member_id',
      'SELECT member_id FROM members ORDER BY RAND() LIMIT 5000',
    );
    await writeCsv(
      conn,
      'job_ids.csv',
      'job_id',
      "SELECT job_id FROM jobs WHERE status = 'open' ORDER BY RAND() LIMIT 2000",
    );
    await writeCsv(
      conn,
      'recruiter_ids.csv',
      'recruiter_id',
      'SELECT recruiter_id FROM recruiters ORDER BY RAND() LIMIT 500',
    );

    // Keywords are static — one line each, header included for JMeter.
    const kwPath = path.join(DATA_DIR, 'search_keywords.csv');
    fs.writeFileSync(kwPath, ['keyword', ...SEARCH_KEYWORDS].join('\n') + '\n');
    console.log(`[extract] wrote ${SEARCH_KEYWORDS.length} keywords -> ${kwPath}`);
  } finally {
    await conn.end();
  }
}

async function writeCsv(conn, filename, header, sql) {
  const [rows] = await conn.query(sql);
  if (rows.length === 0) {
    console.warn(`[extract] WARN: 0 rows for ${filename} — did you run the seeder?`);
  }
  const out = [header, ...rows.map((r) => r[header])].join('\n') + '\n';
  const target = path.join(DATA_DIR, filename);
  fs.writeFileSync(target, out);
  console.log(`[extract] wrote ${rows.length} rows -> ${target}`);
}

main().catch((err) => {
  console.error('[extract] fatal:', err);
  process.exit(1);
});
