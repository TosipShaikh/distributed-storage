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
}

export const recoveryEventRepository = new RecoveryEventRepository();
