import mysql from 'mysql2/promise';
import { logger } from '../util/logger.js';

let pool = null;

export function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'linkedin',
    database: process.env.DB_NAME || 'linkedinclone',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_MAX || 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    namedPlaceholders: true,
  });
  logger.info({ host: process.env.DB_HOST, db: process.env.DB_NAME }, 'mysql pool created');
  return pool;
}

export async function closeMySQL() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

