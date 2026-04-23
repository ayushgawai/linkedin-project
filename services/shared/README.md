# Shared Utilities

Modules imported by multiple Node.js services. Keep this folder **dependency-light** — anything added here is effectively part of every service's bundle.

## Contents

| Module | Purpose | Owner |
|---|---|---|
| `cache.js` | Redis cache-aside helper (`getOrSet`, `invalidate`, `invalidatePrefix`) with graceful degradation on Redis outage. | Member 5 (Naman) |
| `envelope.js` | Standard success/error response envelopes matching the frozen API contract. | Member 5 (Naman) |
| `kafka.js` | `kafkajs` wrapper: `connect()`, `produce(topic, envelope)`, `disconnect()`. Auto-generates `trace_id` + `idempotency_key` if missing. | Member 1 / Member 4 |

## Rules

1. Nothing in this folder may call into any *service-specific* code.
2. Every module must be pure-function or class-based — no singleton side effects at import time.
3. Cache / DB clients must be constructed lazily so unit tests can mock them.

## Usage

Each service imports directly via relative path, e.g.:

```js
import { getOrSet } from '../../shared/cache.js';
```

Node workspaces (`package.json`'s `workspaces: ["services/*"]`) handle the rest.
