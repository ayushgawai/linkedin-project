export function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = new Error('VALIDATION_ERROR');
    err.code = 'VALIDATION_ERROR';
    err.details = { issues: parsed.error.issues };
    throw err;
  }
  return parsed.data;
}

