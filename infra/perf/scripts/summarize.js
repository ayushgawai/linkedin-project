#!/usr/bin/env node
// Parse every *.jtl in results/ and emit results/summary.csv with
// per-scenario+config aggregates (throughput, avg/p95 latency, error%).
//
// Config mapping used for Part 5 presentation:
//   off -> B          (Base)
//   on  -> B+S        (Base + SQL/Redis caching)
//   bsk -> B+S+K      (Base + SQL cache + Kafka)
//   bsk_other -> B+S+K+Other
// Any unknown mode is kept as-is in config_label so future runs still appear.
//
// Usage: node infra/perf/scripts/summarize.js [results_dir]

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const RESULTS_DIR = path.resolve(process.argv[2] || 'infra/perf/results');

async function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`[summarize] ${RESULTS_DIR} does not exist`);
    process.exit(1);
  }
  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jtl'));
  if (files.length === 0) {
    console.error('[summarize] no .jtl files found — run run_all.sh first');
    process.exit(1);
  }

  const rows = [];
  for (const f of files) {
    const full = path.join(RESULTS_DIR, f);
    const agg = await aggregateJtl(full);
    const [scenario, mode] = parseTag(f);
    const configLabel = mapModeToConfig(mode);
    rows.push({ file: f, scenario, mode, configLabel, ...agg });
    console.log(`[summarize] ${f}: ${agg.count} samples, p95=${agg.p95.toFixed(0)}ms, rps=${agg.rps.toFixed(1)}`);
  }

  rows.sort((a, b) => (a.scenario + a.mode).localeCompare(b.scenario + b.mode));

  const csvPath = path.join(RESULTS_DIR, 'summary.csv');
  const header = ['scenario', 'mode', 'config_label', 'samples', 'throughput_rps',
    'avg_latency_ms', 'p95_latency_ms', 'error_rate_pct', 'p50_ms', 'p99_ms',
    'max_ms', 'duration_s', 'file'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.scenario, r.mode, r.configLabel, r.count,
      r.rps.toFixed(2), r.avg.toFixed(1), r.p95.toFixed(0), r.errorPct.toFixed(2),
      r.p50.toFixed(0), r.p99.toFixed(0), r.max,
      r.durationSec.toFixed(1), r.file,
    ].join(','));
  }
  fs.writeFileSync(csvPath, lines.join('\n') + '\n');
  console.log(`[summarize] wrote ${csvPath}`);
}

function mapModeToConfig(mode) {
  const m = (mode || '').toLowerCase();
  if (m === 'off') return 'B';
  if (m === 'on') return 'B+S';
  if (m === 'bsk') return 'B+S+K';
  if (m === 'bsk_other' || m === 'bsk+other' || m === 'bskother') return 'B+S+K+Other';
  return mode || 'unknown';
}

function parseTag(filename) {
  // e.g. "A_on_20260419-154200.jtl"
  const base = filename.replace(/\.jtl$/, '');
  const parts = base.split('_');
  return [parts[0], parts[1]];
}

async function aggregateJtl(filePath) {
  // JMeter default CSV format with header row:
  // timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,...
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const latencies = [];
  let errors = 0;
  let count = 0;
  let firstTs = null;
  let lastTs = null;
  let header = null;
  let idxElapsed, idxSuccess, idxTimestamp;

  for await (const line of rl) {
    if (header === null) {
      header = line.split(',');
      idxElapsed = header.indexOf('elapsed');
      idxSuccess = header.indexOf('success');
      idxTimestamp = header.indexOf('timeStamp');
      if (idxElapsed < 0 || idxSuccess < 0 || idxTimestamp < 0) {
        throw new Error(`${filePath}: unexpected header ${line}`);
      }
      continue;
    }
    if (!line) continue;
    const cols = line.split(',');
    const elapsed = Number(cols[idxElapsed]);
    const success = cols[idxSuccess] === 'true';
    const ts = Number(cols[idxTimestamp]);
    if (!Number.isFinite(elapsed)) continue;
    latencies.push(elapsed);
    if (!success) errors++;
    if (firstTs === null || ts < firstTs) firstTs = ts;
    if (lastTs === null || ts > lastTs) lastTs = ts;
    count++;
  }

  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies.length === 0
    ? 0
    : latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];
  const sum = latencies.reduce((a, b) => a + b, 0);
  const durationSec = firstTs && lastTs ? (lastTs - firstTs) / 1000 : 0;

  return {
    count,
    errorPct: count === 0 ? 0 : (errors / count) * 100,
    avg: count === 0 ? 0 : sum / count,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    max: latencies.length ? latencies[latencies.length - 1] : 0,
    durationSec,
    rps: durationSec > 0 ? count / durationSec : 0,
  };
}

main().catch((err) => {
  console.error('[summarize] fatal:', err);
  process.exit(1);
});
