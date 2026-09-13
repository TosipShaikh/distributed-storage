import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { validateAndResolveChunkPath } from '../utils/validation';
import { StatsResponse } from '../types';

export class StorageService {
  /**
   * Save a chunk binary buffer to disk.
   */
  public async saveChunk(chunkId: string, buffer: Buffer): Promise<{ path: string; size: number }> {
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);
    if (!validation.valid || !validation.sanitizedPath) {
      throw new Error(validation.error || 'Invalid chunk ID');
    }

    // Ensure data directory exists
    if (!fs.existsSync(config.dataDir)) {
      await fs.promises.mkdir(config.dataDir, { recursive: true });
    }

    // Write chunk to filesystem
    await fs.promises.writeFile(validation.sanitizedPath, buffer);
    return {
      path: validation.sanitizedPath,
      size: buffer.length,
    };
  }

  /**
   * Read chunk binary buffer from disk.
   */
  public async readChunk(chunkId: string): Promise<Buffer> {
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);
    if (!validation.valid || !validation.sanitizedPath) {
      throw new Error(validation.error || 'Invalid chunk ID');
    }

    if (!fs.existsSync(validation.sanitizedPath)) {
      const err = new Error(`Chunk '${chunkId}' not found`);
      (err as any).code = 'ENOENT';
      throw err;
    }

    return await fs.promises.readFile(validation.sanitizedPath);
  }

  /**
   * Delete chunk file from disk.
   */
  public async deleteChunk(chunkId: string): Promise<boolean> {
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);
    if (!validation.valid || !validation.sanitizedPath) {
      throw new Error(validation.error || 'Invalid chunk ID');
    }

    if (!fs.existsSync(validation.sanitizedPath)) {
      const err = new Error(`Chunk '${chunkId}' not found`);
      (err as any).code = 'ENOENT';
      throw err;
    }

    await fs.promises.unlink(validation.sanitizedPath);
    return true;
  }

  /**
   * Check if chunk exists on disk.
   */
  public chunkExists(chunkId: string): boolean {
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);
    if (!validation.valid || !validation.sanitizedPath) {
      return false;
    }
    return fs.existsSync(validation.sanitizedPath);
  }

  /**
   * Calculate storage node statistics.
   */
  public getStats(): StatsResponse {
    let usedStorage = 0;
    let numberOfChunks = 0;

    if (fs.existsSync(config.dataDir)) {
      const files = fs.readdirSync(config.dataDir);
      numberOfChunks = files.length;

      for (const file of files) {
        const filePath = path.join(config.dataDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            usedStorage += stat.size;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    let totalStorage = 0;
    let availableStorage = 0;

    try {
      // Node.js 18+ provides fs.statfsSync
      if (typeof fs.statfsSync === 'function') {
        const diskStat = fs.statfsSync(config.dataDir);
        totalStorage = Number(diskStat.blocks) * Number(diskStat.bsize);
        availableStorage = Number(diskStat.bavail) * Number(diskStat.bsize);
      }
    } catch {
      // Fallback if statfs is unavailable
      totalStorage = 100 * 1024 * 1024 * 1024; // 100 GB default estimate
      availableStorage = totalStorage - usedStorage;
    }

    return {
      nodeId: config.nodeId,
      totalStorage,
      usedStorage,
      availableStorage,
      numberOfChunks,
    };
  }
}

export const storageService = new StorageService();
