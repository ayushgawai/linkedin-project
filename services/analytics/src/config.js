import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8006),
  SERVICE_NAME: z.string().default('analytics'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASS: z.string().default('linkedin'),
  DB_NAME: z.string().default('linkedinclone'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB: z.string().default('linkedinclone'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('analytics-service'),
  KAFKA_CONSUMER_GROUP: z.string().default('analytics-consumer-group'),
  KAFKA_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  ANALYTICS_CACHE_TTL_SEC: z.coerce.number().int().positive().default(60),
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
