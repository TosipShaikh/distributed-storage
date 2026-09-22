import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { ChunkReplica, ReplicaStatus } from '../types';

export class ChunkReplicaRepository {
  /**
   * Create a new replica entry mapping a chunk to a storage node.
   * If a replica for (chunk_id, node_id) already exists, update its status.
   */
  async create(
    chunkId: number,
    nodeId: number,
    status: ReplicaStatus = 'active'
  ): Promise<ChunkReplica> {
    const query = `
      INSERT INTO chunk_replicas (chunk_id, node_id, status)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;
    const [result] = await pool.execute<ResultSetHeader>(query, [chunkId, nodeId, status]);

    const replicaId = result.insertId || (await this.findIdByChunkAndNode(chunkId, nodeId));
    if (!replicaId) {
      throw new Error(`Failed to retrieve chunk replica for chunkId=${chunkId}, nodeId=${nodeId}`);
    }

    const replica = await this.findById(replicaId);
    if (!replica) {
      throw new Error(`Failed to load created replica with id ${replicaId}`);
    }
    return replica;
  }

  /**
   * Find a replica by its ID.
   */
  async findById(id: number): Promise<ChunkReplica | null> {
    const query = `
      SELECT id, chunk_id, node_id, status, created_at
      FROM chunk_replicas
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0] as ChunkReplica;
  }

  /**
   * Find replica ID by chunk_id and node_id.
   */
  async findIdByChunkAndNode(chunkId: number, nodeId: number): Promise<number | null> {
    const query = `
      SELECT id FROM chunk_replicas
      WHERE chunk_id = ? AND node_id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [chunkId, nodeId]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0].id;
  }

  /**
   * Find all replicas for a specific chunk.
   */
  async findByChunkId(chunkId: number): Promise<ChunkReplica[]> {
    const query = `
      SELECT id, chunk_id, node_id, status, created_at
      FROM chunk_replicas
      WHERE chunk_id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [chunkId]);
    return rows as ChunkReplica[];
  }

  /**
   * Find all replicas stored on a specific node.
   */
  async findByNodeId(nodeId: number): Promise<ChunkReplica[]> {
    const query = `
      SELECT id, chunk_id, node_id, status, created_at
      FROM chunk_replicas
      WHERE node_id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [nodeId]);
    return rows as ChunkReplica[];
  }

  /**
   * Update the status of a chunk replica.
   */
  async updateStatus(id: number, status: ReplicaStatus): Promise<void> {
    const query = `
      UPDATE chunk_replicas
      SET status = ?
      WHERE id = ?
    `;
    await pool.execute(query, [status, id]);
  }

  /**
   * Delete a replica record for a given chunk on a specific node.
   */
  async deleteByChunkAndNode(chunkId: number, nodeId: number): Promise<void> {
    const query = `
      DELETE FROM chunk_replicas
      WHERE chunk_id = ? AND node_id = ?
    `;
    await pool.execute(query, [chunkId, nodeId]);
  }
}

export const chunkReplicaRepository = new ChunkReplicaRepository();
