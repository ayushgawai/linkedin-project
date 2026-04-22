import crypto from 'node:crypto';

export function generateTraceId() {
  return crypto.randomUUID();
}

export function successResponse(data, traceId) {
  return {
    success: true,
    data,
    trace_id: traceId || generateTraceId(),
  };
}

export function errorResponse(code, message, details, traceId) {
  return {
    success: false,
    error: {
      code,
      message,
      details: details || {},
    },
    trace_id: traceId || generateTraceId(),
  };
}
