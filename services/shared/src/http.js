import { randomUUID } from 'node:crypto';

export function createTraceId() {
  return randomUUID();
}

export function success(data, traceId = createTraceId()) {
  return {
    success: true,
    data,
    trace_id: traceId
  };
}

export function failure(code, message, details = {}, traceId = createTraceId()) {
  return {
    success: false,
    error: {
      code,
      message,
      details
    },
    trace_id: traceId
  };
}

export function sendSuccess(res, data, status = 200, traceId = createTraceId()) {
  return res.status(status).json(success(data, traceId));
}

export function sendError(res, status, code, message, details = {}, traceId = createTraceId()) {
  return res.status(status).json(failure(code, message, details, traceId));
}

export function getPagination(body = {}) {
  const page = Number.isInteger(body.page) ? body.page : Number.parseInt(body.page || '1', 10);
  const pageSize = Number.isInteger(body.page_size)
    ? body.page_size
    : Number.parseInt(body.page_size || '20', 10);

  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20
  };
}

export function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
}
