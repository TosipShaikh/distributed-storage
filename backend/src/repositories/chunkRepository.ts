import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { Chunk } from '../types';

export interface CreateChunkInput {
  sequenceNumber: number;
  size: number;
  hash: string;
}

export class ChunkRepository {
  /**
   * Batch insert chunks for a file within a transaction.
   * Updates file's chunk_count as part of the transaction.
   */
  async createMany(fileId: number, chunks: CreateChunkInput[]): Promise<Chunk[]> {
    if (chunks.length === 0) {
      return [];
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const insertQuery = `
        INSERT INTO chunks (file_id, sequence_number, size, hash)
        VALUES (?, ?, ?, ?)
      `;

      for (const chunk of chunks) {
        await connection.execute(insertQuery, [
          fileId,
          chunk.sequenceNumber,
          chunk.size,
          chunk.hash,
        ]);
      }

      await connection.execute(
        `UPDATE files SET chunk_count = ? WHERE id = ?`,
        [chunks.length, fileId]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.findByFileId(fileId);
  }

  /**
   * Find a chunk by ID.
   */
  async findById(id: number): Promise<Chunk | null> {
    const query = `
      SELECT id, file_id, sequence_number, size, hash, created_at
      FROM chunks
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      id: row.id,
      file_id: row.file_id,
      sequence_number: row.sequence_number,
      size: Number(row.size),
      hash: row.hash,
      created_at: row.created_at,
    };
  }

  /**
   * Find all chunks belonging to a file, ordered by sequence_number.
   */
  async findByFileId(fileId: number): Promise<Chunk[]> {
    const query = `
      SELECT id, file_id, sequence_number, size, hash, created_at
      FROM chunks
      WHERE file_id = ?
      ORDER BY sequence_number ASC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [fileId]);
    return rows.map((row) => ({
      id: row.id,
      file_id: row.file_id,
      sequence_number: row.sequence_number,
      size: Number(row.size),
      hash: row.hash,
      created_at: row.created_at,
    }));
  }
}

export const chunkRepository = new ChunkRepository();
