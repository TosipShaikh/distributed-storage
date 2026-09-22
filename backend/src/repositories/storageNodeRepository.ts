import { RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { StorageNodeRecord, NodeStatus } from '../types';

export class StorageNodeRepository {
  /**
   * Register or update a storage node's registration and configuration.
   */
  async upsert(
    nodeId: string,
    host: string,
    port: number,
    totalStorage: number = 0
  ): Promise<StorageNodeRecord> {
    const query = `
      INSERT INTO storage_nodes (node_id, host, port, total_storage, status, last_heartbeat)
      VALUES (?, ?, ?, ?, 'online', CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        host = VALUES(host),
        port = VALUES(port),
        total_storage = VALUES(total_storage),
        status = 'online',
        last_heartbeat = CURRENT_TIMESTAMP
    `;
    await pool.execute(query, [nodeId, host, port, totalStorage]);

    const node = await this.findByNodeId(nodeId);
    if (!node) {
      throw new Error(`Failed to retrieve storage node with nodeId ${nodeId}`);
    }
    return node;
  }

  /**
   * Find a storage node by its unique string node_id (e.g. 'node-1').
   */
  async findByNodeId(nodeId: string): Promise<StorageNodeRecord | null> {
    const query = `
      SELECT id, node_id, host, port, total_storage, used_storage, status, last_heartbeat, created_at
      FROM storage_nodes
      WHERE node_id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [nodeId]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }

  /**
   * Find a storage node by its integer primary key id.
   */
  async findById(id: number): Promise<StorageNodeRecord | null> {
    const query = `
      SELECT id, node_id, host, port, total_storage, used_storage, status, last_heartbeat, created_at
      FROM storage_nodes
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return this.mapRow(rows[0]);
  }

  /**
   * Get all storage nodes in the registry.
   */
  async findAll(): Promise<StorageNodeRecord[]> {
    const query = `
      SELECT id, node_id, host, port, total_storage, used_storage, status, last_heartbeat, created_at
      FROM storage_nodes
      ORDER BY id ASC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query);
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Get all storage nodes currently marked online.
   */
  async findAllOnline(): Promise<StorageNodeRecord[]> {
    const query = `
      SELECT id, node_id, host, port, total_storage, used_storage, status, last_heartbeat, created_at
      FROM storage_nodes
      WHERE status = 'online'
      ORDER BY id ASC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query);
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Record a heartbeat from a node and update its reported used storage.
   */
  async updateHeartbeat(nodeId: string, usedStorage?: number): Promise<void> {
    if (usedStorage !== undefined) {
      const query = `
        UPDATE storage_nodes
        SET last_heartbeat = CURRENT_TIMESTAMP,
            used_storage = ?,
            status = 'online'
        WHERE node_id = ?
      `;
      await pool.execute(query, [usedStorage, nodeId]);
    } else {
      const query = `
        UPDATE storage_nodes
        SET last_heartbeat = CURRENT_TIMESTAMP,
            status = 'online'
        WHERE node_id = ?
      `;
      await pool.execute(query, [nodeId]);
    }
  }

  /**
   * Update the operational status of a storage node.
   */
  async updateStatus(nodeId: string, status: NodeStatus): Promise<void> {
    const query = `
      UPDATE storage_nodes
      SET status = ?
      WHERE node_id = ?
    `;
    await pool.execute(query, [status, nodeId]);
  }

  private mapRow(row: RowDataPacket): StorageNodeRecord {
    return {
      id: row.id,
      node_id: row.node_id,
      host: row.host,
      port: row.port,
      total_storage: Number(row.total_storage),
      used_storage: Number(row.used_storage),
      status: row.status,
      last_heartbeat: row.last_heartbeat,
      created_at: row.created_at,
    };
  }
}

export const storageNodeRepository = new StorageNodeRepository();
