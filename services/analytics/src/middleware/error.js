import { ZodError } from 'zod';
import { ApiError, fail } from '../util/envelope.js';

export function notFoundHandler(req, res) {
  res.status(404).json(
    fail('ROUTE_NOT_FOUND', `No handler for ${req.method} ${req.path}`, {}, req.traceId),
  );
}

// Four-arg signature is required for Express to recognise this as an error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const traceId = req.traceId;

  if (err instanceof ZodError) {
    req.log?.warn({ issues: err.issues }, 'validation failed');
    return res.status(400).json(
      fail(
        'VALIDATION_ERROR',
        'Request body failed validation',
        {
          issues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        traceId,
      ),
    );
  }

  if (err instanceof ApiError) {
    req.log?.warn({ code: err.code, details: err.details }, err.message);
    return res.status(err.statusCode).json(
      fail(err.code, err.message, err.details, traceId),
    );
  }

  req.log?.error({ err: err.message, stack: err.stack }, 'unhandled error');
  return res.status(500).json(
    fail(
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      process.env.NODE_ENV === 'development' ? { stack: err.stack } : {},
      traceId,
    ),
  );
}
