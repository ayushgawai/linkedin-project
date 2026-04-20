import mysql from 'mysql2/promise';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'linkedin',
      database: process.env.DB_NAME || 'linkedinclone',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
      queueLimit: 0
    });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function withTransaction(work) {
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function checkMySqlHealth() {
  try {
    await getPool().query('SELECT 1');
    return 'connected';
  } catch {
    return 'disconnected';
  }
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

export async function execute(sql, params = []) {
  return getPool().execute(sql, params);
}
