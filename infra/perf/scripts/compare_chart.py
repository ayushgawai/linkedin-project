#!/usr/bin/env python3
"""Generate cache-on vs cache-off comparison charts from summary.csv.

Outputs into results/charts/:
  - <scenario>_latency_comparison.png   (p50 / p95 / p99 bars)
  - all_throughput.png                  (req/s per scenario, grouped by mode)
  - all_error_rate.png                  (error% per scenario, grouped by mode)

Usage:   python3 infra/perf/scripts/compare_chart.py [results_dir]
Requires matplotlib:  pip3 install matplotlib
"""

import csv
import os
import sys
from collections import defaultdict

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    print("[compare_chart] matplotlib not installed. pip3 install matplotlib", file=sys.stderr)
    sys.exit(1)


RESULTS_DIR = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "infra/perf/results")
SUMMARY = os.path.join(RESULTS_DIR, "summary.csv")
CHARTS_DIR = os.path.join(RESULTS_DIR, "charts")
os.makedirs(CHARTS_DIR, exist_ok=True)

if not os.path.isfile(SUMMARY):
    print(f"[compare_chart] missing {SUMMARY} — run summarize.js first", file=sys.stderr)
    sys.exit(1)


def load_rows():
    rows = defaultdict(dict)  # {scenario: {mode: row}}
    with open(SUMMARY, newline="") as f:
        for r in csv.DictReader(f):
            rows[r["scenario"]][r["mode"]] = r
    return rows


def bar_side_by_side(ax, labels, left_values, right_values, left_label, right_label, ylabel, title):
    import numpy as np
    x = np.arange(len(labels))
    w = 0.38
    ax.bar(x - w / 2, left_values, w, label=left_label, color="#2e7d32")
    ax.bar(x + w / 2, right_values, w, label=right_label, color="#c62828")
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend()
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    for i, (lv, rv) in enumerate(zip(left_values, right_values)):
        ax.text(i - w / 2, lv, f"{lv:.0f}", ha="center", va="bottom", fontsize=8)
        ax.text(i + w / 2, rv, f"{rv:.0f}", ha="center", va="bottom", fontsize=8)


def chart_latency_per_scenario(rows):
    for scenario, modes in rows.items():
        on = modes.get("on")
        off = modes.get("off")
        if not on or not off:
            print(f"[compare_chart] skipping {scenario}: need both ON and OFF runs")
            continue
        labels = ["p50", "p95", "p99", "avg"]
        on_vals = [float(on["p50_ms"]), float(on["p95_ms"]), float(on["p99_ms"]), float(on["avg_ms"])]
        off_vals = [float(off["p50_ms"]), float(off["p95_ms"]), float(off["p99_ms"]), float(off["avg_ms"])]

        fig, ax = plt.subplots(figsize=(8, 5))
        bar_side_by_side(ax, labels, on_vals, off_vals,
                         "Redis ON", "Redis OFF",
                         "Latency (ms)",
                         f"Scenario {scenario} — latency: cache ON vs OFF")
        fig.tight_layout()
        out = os.path.join(CHARTS_DIR, f"{scenario}_latency_comparison.png")
        fig.savefig(out, dpi=120)
        plt.close(fig)
        print(f"[compare_chart] wrote {out}")


def chart_throughput(rows):
    scenarios = sorted(rows.keys())
    on_vals, off_vals = [], []
    for s in scenarios:
        on_vals.append(float(rows[s].get("on", {}).get("rps", 0)))
        off_vals.append(float(rows[s].get("off", {}).get("rps", 0)))

    fig, ax = plt.subplots(figsize=(8, 5))
    bar_side_by_side(ax, [f"Scenario {s}" for s in scenarios],
                     on_vals, off_vals,
                     "Redis ON", "Redis OFF",
                     "Requests / sec",
                     "Throughput: cache ON vs OFF")
    fig.tight_layout()
    out = os.path.join(CHARTS_DIR, "all_throughput.png")
    fig.savefig(out, dpi=120)
    plt.close(fig)
    print(f"[compare_chart] wrote {out}")


def chart_error_rate(rows):
    scenarios = sorted(rows.keys())
    on_vals, off_vals = [], []
    for s in scenarios:
        on_vals.append(float(rows[s].get("on", {}).get("error_pct", 0)))
        off_vals.append(float(rows[s].get("off", {}).get("error_pct", 0)))

    fig, ax = plt.subplots(figsize=(8, 5))
    bar_side_by_side(ax, [f"Scenario {s}" for s in scenarios],
                     on_vals, off_vals,
                     "Redis ON", "Redis OFF",
                     "Error rate (%)",
                     "Error rate: cache ON vs OFF")
    fig.tight_layout()
    out = os.path.join(CHARTS_DIR, "all_error_rate.png")
    fig.savefig(out, dpi=120)
    plt.close(fig)
    print(f"[compare_chart] wrote {out}")


def main():
    rows = load_rows()
    if not rows:
        print("[compare_chart] summary.csv is empty"); sys.exit(1)
    chart_latency_per_scenario(rows)
    chart_throughput(rows)
    chart_error_rate(rows)
    print(f"[compare_chart] done — charts in {CHARTS_DIR}")


if __name__ == "__main__":
    main()
