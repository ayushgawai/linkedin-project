import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: config.SERVICE_NAME, pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.DB_PASS'],
    censor: '[REDACTED]',
  },
});

export function childLogger(bindings) {
  return logger.child(bindings);
}
