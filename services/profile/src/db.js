import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: services/profile/src -> ../../../.env
dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

// Defaults match .env.example: 127.0.0.1:3307 (Docker MySQL host publish from infra/docker-compose.yml)
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS !== undefined && process.env.DB_PASS !== '' ? process.env.DB_PASS : 'linkedin',
  database: process.env.DB_NAME || 'linkedinclone',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function pingDb() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } catch {
    return false;
  } finally {
    conn.release();
  }
}

export { pool };
