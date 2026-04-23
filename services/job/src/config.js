import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8002),
  SERVICE_NAME: z.string().default('job'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().default('linkedin'),
  DB_NAME: z.string().default('linkedinclone'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  CACHE_TTL_ENTITY_SEC: z.coerce.number().int().positive().default(300),
  CACHE_TTL_SEARCH_SEC: z.coerce.number().int().positive().default(60),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

function loadConfig() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`[config] Invalid environment variables:\n${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const config = loadConfig();
