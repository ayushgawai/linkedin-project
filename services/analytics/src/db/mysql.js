import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

let pool = null;

export function getPool() {
  if (pool) return pool;
  const tunedPoolMax = config.OTHER_TECHNIQUES_ENABLED
    ? config.DB_POOL_MAX * 2
    : config.DB_POOL_MAX;
  pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: tunedPoolMax,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    namedPlaceholders: true,
  });
  logger.info(
    {
      host: config.DB_HOST,
      db: config.DB_NAME,
      pool_max: tunedPoolMax,
      other_techniques_enabled: config.OTHER_TECHNIQUES_ENABLED,
    },
    'mysql pool created',
  );
  return pool;
}

export async function pingMySQL() {
  try {
    const [rows] = await getPool().query('SELECT 1 AS ok');
    return rows?.[0]?.ok === 1;
  } catch (err) {
    logger.warn({ err: err.message }, 'mysql ping failed');
    return false;
  }
}

export async function closeMySQL() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
