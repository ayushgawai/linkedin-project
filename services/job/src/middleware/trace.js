import { v4 as uuidv4 } from 'uuid';
import { childLogger } from '../util/logger.js';

export function traceMiddleware(req, res, next) {
  const incoming = req.headers['x-trace-id'] || req.body?.trace_id || null;
  const traceId = incoming || uuidv4();
  req.traceId = traceId;
  req.log = childLogger({ trace_id: traceId, path: req.path, method: req.method });
  res.setHeader('x-trace-id', traceId);
  const startNs = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
    req.log.info(
      { status: res.statusCode, duration_ms: Number(durMs.toFixed(2)) },
      'request completed',
    );
  });
  next();
}
