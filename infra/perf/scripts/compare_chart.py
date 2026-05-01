#!/usr/bin/env python3
"""Generate scenario comparison charts from summary.csv.

Outputs into results/charts/:
  - scenario_A_config_comparison.png
  - scenario_B_config_comparison.png
  - scenario_C_config_comparison.png

Only includes .jtl rows whose filename contains _{N}u_ (thread count) when
BENCH_CHART_THREADS or BENCH_JMETER_THREADS is set, so all four bars match
the same load. run_all.sh sets BENCH_CHART_THREADS from BENCH_JMETER_THREADS.

Usage:   python3 infra/perf/scripts/compare_chart.py [results_dir]
Requires matplotlib:  pip3 install matplotlib
"""

import csv
import os
import re
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


CONFIG_ORDER = ["B", "B+S", "B+S+K", "B+S+K+Other"]
CONFIG_TO_MODE = {
    "B": "off",
    "B+S": "on",
    "B+S+K": "bsk",
    "B+S+K+Other": "bsk_other",
}

_FILE_TS = re.compile(r"(\d{8}-\d{6})\.jtl$")


def _file_timestamp(filename):
    m = _FILE_TS.search(filename or "")
    return m.group(1) if m else ""


def _thread_tag_from_env():
    raw = os.environ.get("BENCH_CHART_THREADS") or os.environ.get("BENCH_JMETER_THREADS")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        n = int(str(raw).strip())
        return f"_{n}u_"
    except ValueError:
        return None


def _row_count(rows):
    return sum(len(by_cfg) for by_cfg in rows.values())


def _build_rows(thread_tag):
    rows = defaultdict(dict)  # {scenario: {config_label: row}}
    with open(SUMMARY, newline="") as f:
        for r in csv.DictReader(f):
            fname = r.get("file", "")
            if thread_tag and thread_tag not in fname:
                continue

            cfg = r.get("config_label") or map_mode_to_config(r.get("mode", ""))
            if cfg not in CONFIG_ORDER:
                continue
            sc = r["scenario"]
            prev = rows[sc].get(cfg)
            if prev is None:
                rows[sc][cfg] = r
                continue

            prev_file = prev.get("file", "")
            cur_file = r.get("file", "")
            prev_is_10 = "_10users_" in prev_file
            cur_is_10 = "_10users_" in cur_file
            if thread_tag:
                if _file_timestamp(cur_file) >= _file_timestamp(prev_file):
                    rows[sc][cfg] = r
            elif cur_is_10 and not prev_is_10:
                rows[sc][cfg] = r
            elif cur_is_10 == prev_is_10:
                rows[sc][cfg] = r
    return rows


def load_rows():
    requested = _thread_tag_from_env()
    if requested:
        print(
            f"[compare_chart] preferring files containing {requested!r} (same thread count per bar)",
            file=sys.stderr,
        )

    rows = _build_rows(requested)
    effective = requested

    if requested and _row_count(rows) == 0:
        print(
            "[compare_chart] WARNING: no summary rows matched the thread tag. "
            "Your .jtl files may predate run_all.sh tagging — using all runs (load may differ per bar). "
            "Re-run: bash infra/perf/scripts/run_all.sh full",
            file=sys.stderr,
        )
        rows = _build_rows(None)
        effective = None

    return rows, effective


def map_mode_to_config(mode):
    m = (mode or "").lower()
    if m in ("off", "b"):
        return "B"
    if m in ("on", "bs"):
        return "B+S"
    if m == "bsk":
        return "B+S+K"
    if m in ("bsk_other", "bsk+other", "bskother"):
        return "B+S+K+Other"
    return mode


def chart_scenario(rows, scenario, threads_note=None):
    import numpy as np
    by_cfg = rows.get(scenario, {})
    x = np.arange(len(CONFIG_ORDER))
    width = 0.5

    throughput_vals = []
    p95_vals = []
    measured = []
    for cfg in CONFIG_ORDER:
        r = by_cfg.get(cfg)
        if r is None:
            throughput_vals.append(0.0)
            p95_vals.append(0.0)
            measured.append(False)
        else:
            throughput_vals.append(float(r["throughput_rps"]))
            p95_vals.append(float(r["p95_latency_ms"]))
            measured.append(True)

    fig, ax1 = plt.subplots(figsize=(10, 5.5))
    ax2 = ax1.twinx()

    # Throughput bars (primary axis)
    colors = ["#2e7d32" if ok else "#bdbdbd" for ok in measured]
    bars = ax1.bar(x, throughput_vals, width, color=colors, edgecolor="#424242", label="Throughput (req/s)")
    ax1.set_ylabel("Throughput (req/s)", color="#1b5e20")
    ax1.tick_params(axis="y", labelcolor="#1b5e20")
    ax1.set_xticks(x)
    ax1.set_xticklabels(CONFIG_ORDER)
    ax1.grid(axis="y", linestyle="--", alpha=0.35)

    # P95 line (secondary axis)
    plotted_x = [x[i] for i, ok in enumerate(measured) if ok]
    plotted_p95 = [p95_vals[i] for i, ok in enumerate(measured) if ok]
    if plotted_x:
        ax2.plot(plotted_x, plotted_p95, color="#0d47a1", marker="o", linewidth=2, label="P95 latency (ms)")
    ax2.set_ylabel("P95 latency (ms)", color="#0d47a1")
    ax2.tick_params(axis="y", labelcolor="#0d47a1")

    title = f"Scenario {scenario}: B vs B+S vs B+S+K vs B+S+K+Other"
    if threads_note:
        title += f" ({threads_note} concurrent threads)"
    ax1.set_title(title)

    # Annotate bars and missing configs.
    for i, b in enumerate(bars):
        if measured[i]:
            ax1.text(
                b.get_x() + b.get_width() / 2,
                b.get_height(),
                f"{throughput_vals[i]:.2f}",
                ha="center",
                va="bottom",
                fontsize=8,
            )
            ax2.text(
                x[i],
                p95_vals[i],
                f"p95={p95_vals[i]:.0f}",
                color="#0d47a1",
                ha="center",
                va="bottom",
                fontsize=8,
            )
        else:
            ax1.text(
                x[i],
                max(throughput_vals + [1]) * 0.06,
                "not measured",
                color="#616161",
                ha="center",
                va="bottom",
                fontsize=8,
                rotation=90,
            )

    # Combined legend from both axes.
    h1, l1 = ax1.get_legend_handles_labels()
    h2, l2 = ax2.get_legend_handles_labels()
    ax1.legend(h1 + h2, l1 + l2, loc="upper right")

    fig.tight_layout()
    out = os.path.join(CHARTS_DIR, f"scenario_{scenario}_config_comparison.png")
    fig.savefig(out, dpi=130)
    plt.close(fig)
    print(f"[compare_chart] wrote {out}")


def main():
    rows, thread_tag_effective = load_rows()
    if _row_count(rows) == 0:
        print("[compare_chart] summary.csv has no usable rows for A/B/C charts.", file=sys.stderr)
        sys.exit(1)

    threads_note = None
    if thread_tag_effective:
        raw_threads = os.environ.get("BENCH_CHART_THREADS") or os.environ.get("BENCH_JMETER_THREADS")
        if raw_threads and str(raw_threads).strip():
            threads_note = str(raw_threads).strip()
        else:
            m = re.search(r"_(\d+)u_", thread_tag_effective)
            threads_note = m.group(1) if m else None

    for scenario in ["A", "B", "C"]:
        chart_scenario(rows, scenario, threads_note)
    print(f"[compare_chart] done — charts in {CHARTS_DIR}")


if __name__ == "__main__":
    main()
