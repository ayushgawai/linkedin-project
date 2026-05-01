import { v4 as uuidv4 } from 'uuid';

export function ok(data, traceId) {
  return {
    success: true,
    data,
    trace_id: traceId || uuidv4(),
  };
}

export class ApiError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

