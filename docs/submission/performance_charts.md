# Performance Charts

Source: `docs/perf-results.json`

## Average latency

```mermaid
xychart-beta
    title "Average latency (ms)"
    x-axis ["A Base", "A Cache", "B Kafka Apply"]
    y-axis "ms" 0 --> 500
    bar [368.3, 308.3, 403.4]
```

## p95 latency

```mermaid
xychart-beta
    title "p95 latency (ms)"
    x-axis ["A Base", "A Cache", "B Kafka Apply"]
    y-axis "ms" 0 --> 2000
    bar [1777.1, 472.6, 1018.4]
```

## Throughput proxy (requests completed in benchmark run)

```mermaid
xychart-beta
    title "Completed requests per benchmark run"
    x-axis ["A Base", "A Cache", "B Kafka Apply"]
    y-axis "requests" 0 --> 550
    bar [500, 500, 300]
```

## Interpretation

- `A Base` = job search + detail without warm-cache benefit
- `A Cache` = same scenario with Redis-backed warm-cache path
- `B Kafka Apply` = application submit including DB write + Kafka event publish

The strongest result is the large reduction in tail latency for Scenario A after caching is active.
