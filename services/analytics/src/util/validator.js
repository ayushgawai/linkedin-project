export function validate(schema, data) {
  return schema.parse(data);
}
