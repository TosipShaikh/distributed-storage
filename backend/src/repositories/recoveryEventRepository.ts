import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { RecoveryEvent, RecoveryEventType, RecoveryEventStatus } from '../types';

export class RecoveryEventRepository {
  /**
   * Log a new recovery event.
   */
  async create(
    nodeId: number | null,
    chunkId: number | null,
    eventType: RecoveryEventType,
    status: RecoveryEventStatus = 'pending'
  ): Promise<RecoveryEvent> {
    const query = `
      INSERT INTO recovery_events (node_id, chunk_id, event_type, status)
      VALUES (?, ?, ?, ?)
    `;
    const [result] = await pool.execute<ResultSetHeader>(query, [
      nodeId,
      chunkId,
      eventType,
      status,
    ]);

    const event = await this.findById(result.insertId);
    if (!event) {
      throw new Error(`Failed to retrieve newly created recovery event with id ${result.insertId}`);
    }
    return event;
  }

  /**
   * Find a recovery event by ID.
   */
  async findById(id: number): Promise<RecoveryEvent | null> {
    const query = `
      SELECT id, node_id, chunk_id, event_type, status, created_at
      FROM recovery_events
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0] as RecoveryEvent;
  }

  /**
   * Find all currently pending recovery events.
   */
  async findPending(): Promise<RecoveryEvent[]> {
    const query = `
      SELECT id, node_id, chunk_id, event_type, status, created_at
      FROM recovery_events
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query);
    return rows as RecoveryEvent[];
  }

  /**
   * Update the status of a recovery event.
   */
  async updateStatus(id: number, status: RecoveryEventStatus): Promise<void> {
    const query = `
      UPDATE recovery_events
      SET status = ?
      WHERE id = ?
    `;
    await pool.execute(query, [status, id]);
  }

  /**
   * Find most recent recovery events.
   */
  async findRecent(limit: number = 50): Promise<RecoveryEvent[]> {
    const query = `
      SELECT id, node_id, chunk_id, event_type, status, created_at
      FROM recovery_events
      ORDER BY id DESC
      LIMIT ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [String(limit)]);
    return rows as RecoveryEvent[];
  }

  /**
   * Get summary counts of recovery events by status.
   */
  async getStats(): Promise<{ total: number; pending: number; in_progress: number; completed: number; failed: number }> {
    const query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM recovery_events
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query);
    const r = rows[0] || {};
    return {
      total: Number(r.total || 0),
      pending: Number(r.pending || 0),
      in_progress: Number(r.in_progress || 0),
      completed: Number(r.completed || 0),
      failed: Number(r.failed || 0),
    };
  }
}

export const recoveryEventRepository = new RecoveryEventRepository();
