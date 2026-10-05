import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';
import { chunkRepository } from '../repositories/chunkRepository';
import { fileRepository } from '../repositories/fileRepository';
import { storageCoordinator } from './storageCoordinator';
import {
  Chunk,
  ChunkInfo,
  ChunkPlan,
  ChunkDispatchHandler,
  ChunkStreamProvider,
  ChunkPlacement,
  DfsFile,
} from '../types';

export interface ProcessUploadOptions {
  chunkSize?: number;
  onChunk?: ChunkDispatchHandler;
  skipDistribution?: boolean;
}

export class ChunkService {
  /**
   * Determine the byte boundaries and sequence numbers for splitting a file of given size.
   * Handles 0-byte files, small files, exact multiple chunk files, and final partial chunks.
   */
  calculateChunkPlan(fileSize: number, chunkSize?: number): ChunkPlan[] {
    if (chunkSize !== undefined && chunkSize <= 0) {
      throw new Error(`Chunk size must be greater than 0, received ${chunkSize}`);
    }

    const effectiveChunkSize = chunkSize !== undefined ? chunkSize : config.chunk.defaultSize;

    if (effectiveChunkSize <= 0) {
      throw new Error(`Chunk size must be greater than 0, received ${effectiveChunkSize}`);
    }

    if (fileSize <= 0) {
      return [];
    }

    const totalChunks = Math.ceil(fileSize / effectiveChunkSize);
    const plans: ChunkPlan[] = [];

    for (let seq = 1; seq <= totalChunks; seq++) {
      const startByte = (seq - 1) * effectiveChunkSize;
      const endByte = Math.min(seq * effectiveChunkSize - 1, fileSize - 1);
      const size = endByte - startByte + 1;

      plans.push({
        sequenceNumber: seq,
        startByte,
        endByte,
        size,
      });
    }

    return plans;
  }

  /**
   * Create a readable stream for a specific byte range of a file.
   * Enables zero-memory streaming directly to storage nodes or hash digests.
   */
  createChunkReadStream(filePath: string, startByte: number, endByte: number): fs.ReadStream {
    return fs.createReadStream(filePath, {
      start: startByte,
      end: endByte,
      highWaterMark: 64 * 1024, // 64 KB buffer chunk
    });
  }

  /**
   * Compute the SHA-256 hash of a chunk byte slice without loading the chunk or file into memory.
   */
  async computeChunkHash(filePath: string, startByte: number, endByte: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = this.createChunkReadStream(filePath, startByte, endByte);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Split a file into sequential chunks and compute hashes.
   * Supports an optional onChunk callback designed for streaming chunk binaries to storage nodes.
   */
  async splitAndProcess(
    filePath: string,
    fileId: number,
    options?: ProcessUploadOptions
  ): Promise<ChunkInfo[]> {
    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;
    const plans = this.calculateChunkPlan(fileSize, options?.chunkSize);

    const chunks: ChunkInfo[] = [];

    for (const plan of plans) {
      const chunkId = crypto.randomUUID();
      const hash = await this.computeChunkHash(filePath, plan.startByte, plan.endByte);

      const chunkInfo: ChunkInfo = {
        chunkId,
        fileId,
        sequenceNumber: plan.sequenceNumber,
        size: plan.size,
        hash,
      };

      // Pluggable hook: allows custom stream interceptor if needed
      if (options?.onChunk) {
        const streamProvider: ChunkStreamProvider = () =>
          this.createChunkReadStream(filePath, plan.startByte, plan.endByte);
        await options.onChunk(chunkInfo, streamProvider);
      }

      chunks.push(chunkInfo);
    }

    return chunks;
  }

  /**
   * Safely delete a temporary file if it exists.
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.warn(`[ChunkService] Warning: Failed to delete temp file ${filePath}:`, (err as Error).message);
    }
  }

  /**
   * Complete upload orchestration:
   * 1. Splits temporary file into sequential chunks and computes hashes.
   * 2. Persists chunk metadata to MySQL.
   * 3. Storage Coordinator: Discovers healthy nodes, selects via round-robin,
   *    streams chunk binaries over HTTP, confirms storage, and records chunk_replicas.
   * 4. Updates file status to 'complete'.
   * 5. Unlinks the temporary file.
   * 6. Ensures failures do not leave inconsistent metadata or orphaned binaries.
   */
  async processUpload(
    fileId: number,
    tempFilePath: string,
    options?: ProcessUploadOptions
  ): Promise<{ file: DfsFile; chunks: Chunk[]; placements: ChunkPlacement[] }> {
    let createdChunks: Chunk[] = [];

    try {
      const stat = await fs.promises.stat(tempFilePath);
      const plans = this.calculateChunkPlan(stat.size, options?.chunkSize);

      // 1. Process chunks (streaming hashes and chunk info)
      const chunkInfos = await this.splitAndProcess(tempFilePath, fileId, options);

      // 2. Persist chunk metadata to MySQL
      createdChunks = await chunkRepository.createMany(
        fileId,
        chunkInfos.map((c) => ({
          chunkId: c.chunkId,
          sequenceNumber: c.sequenceNumber,
          size: c.size,
          hash: c.hash,
        }))
      );

      // 3. Storage Coordinator: Distribute chunks to storage nodes via round-robin
      let placements: ChunkPlacement[] = [];
      if (!options?.skipDistribution) {
        placements = await storageCoordinator.distributeChunks(createdChunks, tempFilePath, plans);
      }

      // 4. Mark file complete in MySQL
      await fileRepository.updateStatus(fileId, 'complete');

      // 5. Delete temporary file on coordinator disk
      await this.cleanupTempFile(tempFilePath);

      // 6. Fetch updated file record
      const updatedFile = await fileRepository.findById(fileId);
      if (!updatedFile) {
        throw new Error(`File record with id ${fileId} not found after chunking`);
      }

      return {
        file: updatedFile,
        chunks: createdChunks,
        placements,
      };
    } catch (error) {
      console.error(`[ChunkService] Upload processing failed for file ${fileId}:`, (error as Error).message);

      // Ensure no inconsistent metadata remains in MySQL
      try {
        await chunkRepository.deleteByFileId(fileId);
        await fileRepository.updateStatus(fileId, 'failed');
      } catch (cleanupDbErr) {
        console.error(`[ChunkService] Failed to clean up database state for file ${fileId}:`, (cleanupDbErr as Error).message);
      }

      // Ensure temporary file is deleted
      await this.cleanupTempFile(tempFilePath);

      throw error;
    }
  }
}

export const chunkService = new ChunkService();

