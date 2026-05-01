/**
 * Minimal perf runner for professor-required scenarios.
 *
 * Scenario A: job search + job detail view
 * Scenario B: apply submit (DB write + Kafka event)
 *
 * Runs with plain Node fetch (no extra deps) and prints avg/p95.
 */
import { performance } from 'node:perf_hooks';

const API = process.env.API_BASE_URL || 'http://127.0.0.1:8011';
const ANALYTICS = process.env.ANALYTICS_BASE_URL || 'http://127.0.0.1:8006';
const BENCH_TOKEN = process.env.BENCH_ADMIN_TOKEN || 'dev-only';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function stats(latenciesMs) {
  const xs = [...latenciesMs].sort((a, b) => a - b);
  const n = xs.length;
  const avg = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const p = (q) => xs[Math.min(n - 1, Math.floor(q * n))] ?? 0;
  return {
    n,
    avg_ms: Number(avg.toFixed(1)),
    p50_ms: Number(p(0.5).toFixed(1)),
    p95_ms: Number(p(0.95).toFixed(1)),
    p99_ms: Number(p(0.99).toFixed(1)),
  };
}

async function flushRedis() {
  await postJson(
    `${ANALYTICS}/benchmark/cache/flush`,
    {},
    { 'x-bench-token': BENCH_TOKEN },
  );
}

async function scenarioAOnce() {
  const t0 = performance.now();
  const search = await postJson(`${API}/jobs/search`, {
    keyword: 'engineer',
    page: 1,
    page_size: 20,
  });
  const jobs = search?.json?.data?.results || search?.json?.data?.jobs || search?.json?.results || [];
  const jobId = jobs?.[0]?.job_id || jobs?.[0]?.id;
  if (jobId) {
    await postJson(`${API}/jobs/get`, { job_id: jobId });
  }
  return performance.now() - t0;
}

async function scenarioBOnce(jobId) {
  const t0 = performance.now();
  // use a fixed demo member; rotate jobs to avoid duplicate-application conflict dominating
  await postJson(`${API}/applications/submit`, {
    job_id: jobId,
    member_id: '22222222-2222-2222-2222-222222222222',
    resume_text: 'demo resume text',
    cover_letter: 'demo cover letter',
    idempotency_key: `${jobId}:22222222`,
  });
  return performance.now() - t0;
}

async function getJobIds(max = 25) {
  const search = await postJson(`${API}/jobs/search`, { keyword: 'engineer', page: 1, page_size: max });
  const jobs = search?.json?.data?.results || search?.json?.data?.jobs || search?.json?.results || [];
  return jobs.map((j) => j.job_id || j.id).filter(Boolean);
}

async function run(label, fn, { concurrency = 100, total = 500 } = {}) {
  const lat = [];
  let i = 0;

  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= total) return;
      const ms = await fn(idx);
      lat.push(ms);
    }
  }

  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsed = performance.now() - start;
  const s = stats(lat);
  return { label, elapsed_ms: Number(elapsed.toFixed(1)), ...s };
}

async function main() {
  const jobIds = await getJobIds(30);
  if (jobIds.length === 0) {
    console.error('No jobs found; seed the DB first (docker compose down -v && up, or /benchmark/seed).');
    process.exitCode = 2;
    return;
  }

  // B (base-ish): flush Redis then run
  await flushRedis();
  await sleep(200);
  const A_base = await run('Scenario A (base; cache cold)', () => scenarioAOnce(), { concurrency: 100, total: 500 });

  // B+S (cache warm): do not flush; run again immediately
  const A_cached = await run('Scenario A (cache warm)', () => scenarioAOnce(), { concurrency: 100, total: 500 });

  // Scenario B: apply submit; rotate jobs to avoid 409 dominating
  const B_apply = await run(
    'Scenario B (apply submit; DB + Kafka produce)',
    (idx) => scenarioBOnce(jobIds[idx % jobIds.length]),
    { concurrency: 100, total: 300 },
  );

  console.log(JSON.stringify({ at: new Date().toISOString(), results: [A_base, A_cached, B_apply] }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

