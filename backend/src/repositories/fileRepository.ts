import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { DfsFile, FileStatus } from '../types';

export class FileRepository {
  /**
   * Create a new file metadata entry.
   */
  async create(
    userId: number,
    filename: string,
    size: number,
    chunkCount: number = 0,
    status: FileStatus = 'uploading'
  ): Promise<DfsFile> {
    const query = `
      INSERT INTO files (user_id, filename, size, chunk_count, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.execute<ResultSetHeader>(query, [
      userId,
      filename,
      size,
      chunkCount,
      status,
    ]);
    const file = await this.findById(result.insertId);
    if (!file) {
      throw new Error(`Failed to retrieve newly created file with id ${result.insertId}`);
    }
    return file;
  }

  /**
   * Find a file metadata record by ID.
   */
  async findById(id: number): Promise<DfsFile | null> {
    const query = `
      SELECT id, user_id, filename, size, chunk_count, status, created_at
      FROM files
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      filename: row.filename,
      size: Number(row.size),
      chunk_count: row.chunk_count,
      status: row.status,
      created_at: row.created_at,
    };
  }

  /**
   * Find all files belonging to a specific user.
   */
  async findByUserId(userId: number): Promise<DfsFile[]> {
    const query = `
      SELECT id, user_id, filename, size, chunk_count, status, created_at
      FROM files
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [userId]);
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      filename: row.filename,
      size: Number(row.size),
      chunk_count: row.chunk_count,
      status: row.status,
      created_at: row.created_at,
    }));
  }

  /**
   * Update the status of a file.
   */
  async updateStatus(id: number, status: FileStatus): Promise<void> {
    const query = `
      UPDATE files
      SET status = ?
      WHERE id = ?
    `;
    await pool.execute(query, [status, id]);
  }

  /**
   * Delete a file by ID using a transaction.
   * Cascade deletion cleans up corresponding chunks and replicas.
   */
  async deleteById(id: number): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(`UPDATE files SET status = 'deleting' WHERE id = ?`, [id]);
      await connection.execute(`DELETE FROM files WHERE id = ?`, [id]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const fileRepository = new FileRepository();
