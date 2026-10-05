import { RowDataPacket, PoolConnection } from 'mysql2/promise';
import crypto from 'crypto';
import pool from '../config/db';
import { Chunk } from '../types';

export interface CreateChunkInput {
  chunkId?: string;
  sequenceNumber: number;
  size: number;
  hash: string;
}

export class ChunkRepository {
  /**
   * Batch insert chunks for a file within a transaction.
   * Updates file's chunk_count as part of the transaction.
   * Can accept an existing PoolConnection or create a new transaction.
   */
  async createMany(
    fileId: number,
    chunks: CreateChunkInput[],
    externalConn?: PoolConnection
  ): Promise<Chunk[]> {
    if (chunks.length === 0) {
      return [];
    }

    const connection = externalConn || (await pool.getConnection());
    const isLocalTransaction = !externalConn;

    try {
      if (isLocalTransaction) {
        await connection.beginTransaction();
      }

      const insertQuery = `
        INSERT INTO chunks (chunk_id, file_id, sequence_number, size, hash)
        VALUES (?, ?, ?, ?, ?)
      `;

      for (const chunk of chunks) {
        const finalChunkId = chunk.chunkId || crypto.randomUUID();
        await connection.execute(insertQuery, [
          finalChunkId,
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

      if (isLocalTransaction) {
        await connection.commit();
      }
    } catch (error) {
      if (isLocalTransaction) {
        await connection.rollback();
      }
      throw error;
    } finally {
      if (isLocalTransaction) {
        connection.release();
      }
    }

    return this.findByFileId(fileId);
  }

  /**
   * Find a chunk by auto-increment numeric ID.
   */
  async findById(id: number): Promise<Chunk | null> {
    const query = `
      SELECT id, chunk_id, file_id, sequence_number, size, hash, created_at
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
      chunk_id: row.chunk_id,
      file_id: row.file_id,
      sequence_number: row.sequence_number,
      size: Number(row.size),
      hash: row.hash,
      created_at: row.created_at,
    };
  }

  /**
   * Find a chunk by unique chunk_id (UUID string).
   */
  async findByChunkId(chunkId: string): Promise<Chunk | null> {
    const query = `
      SELECT id, chunk_id, file_id, sequence_number, size, hash, created_at
      FROM chunks
      WHERE chunk_id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [chunkId]);
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      id: row.id,
      chunk_id: row.chunk_id,
      file_id: row.file_id,
      sequence_number: row.sequence_number,
      size: Number(row.size),
      hash: row.hash,
      created_at: row.created_at,
    };
  }

  /**
   * Find all chunks belonging to a file, ordered by sequence_number ascending.
   */
  async findByFileId(fileId: number): Promise<Chunk[]> {
    const query = `
      SELECT id, chunk_id, file_id, sequence_number, size, hash, created_at
      FROM chunks
      WHERE file_id = ?
      ORDER BY sequence_number ASC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [fileId]);
    return rows.map((row) => ({
      id: row.id,
      chunk_id: row.chunk_id,
      file_id: row.file_id,
      sequence_number: row.sequence_number,
      size: Number(row.size),
      hash: row.hash,
      created_at: row.created_at,
    }));
  }

  /**
   * Delete all chunks belonging to a file.
   */
  async deleteByFileId(fileId: number): Promise<void> {
    const query = `DELETE FROM chunks WHERE file_id = ?`;
    await pool.execute(query, [fileId]);
  }
}

export const chunkRepository = new ChunkRepository();

