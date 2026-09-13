import mysql from 'mysql2/promise';
import { config } from './index';

/**
 * MySQL connection pool.
 * Uses mysql2/promise for async/await support.
 */
const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/**
 * Test the database connection.
 * Returns true if successful, false otherwise.
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('[DB] Connection failed:', (error as Error).message);
    return false;
  }
}

export default pool;
