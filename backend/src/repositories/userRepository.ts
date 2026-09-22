import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';
import { User } from '../types';

export class UserRepository {
  /**
   * Create a new user record.
   */
  async create(name: string, email: string, passwordHash: string): Promise<User> {
    const query = `
      INSERT INTO users (name, email, password_hash)
      VALUES (?, ?, ?)
    `;
    const [result] = await pool.execute<ResultSetHeader>(query, [name, email, passwordHash]);
    const user = await this.findById(result.insertId);
    if (!user) {
      throw new Error(`Failed to retrieve newly created user with id ${result.insertId}`);
    }
    return user;
  }

  /**
   * Find a user by their primary key ID.
   */
  async findById(id: number): Promise<User | null> {
    const query = `
      SELECT id, name, email, password_hash, created_at
      FROM users
      WHERE id = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0] as User;
  }

  /**
   * Find a user by email address.
   */
  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, name, email, password_hash, created_at
      FROM users
      WHERE email = ?
    `;
    const [rows] = await pool.execute<RowDataPacket[]>(query, [email]);
    if (rows.length === 0) {
      return null;
    }
    return rows[0] as User;
  }
}

export const userRepository = new UserRepository();
