export class ValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConflictError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'NotFoundError';
    this.code = code;
    this.details = details;
  }
}

export function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${fieldName} is required`, { field: fieldName });
  }

  return value.trim();
}

export function requireEmail(value) {
  const email = requireString(value, 'email').toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('email must be valid', { field: 'email' });
  }

  return email;
}

export function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError('field must be a string');
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
