import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileRepository } from '../repositories/fileRepository';
import { chunkRepository } from '../repositories/chunkRepository';
import { chunkReplicaRepository } from '../repositories/chunkReplicaRepository';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { chunkService } from '../services/chunkService';
import { storageCoordinator } from '../services/storageCoordinator';
import { authenticateToken } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';
import { config } from '../config';
import { StorageNodeRecord } from '../types';

const router = Router();

// Protect all file management routes with JWT authentication
router.use(authenticateToken);

/**
 * POST /api/files/upload
 * Accepts an uploaded file, splits it into sequential chunks, stores chunk metadata
 * in MySQL, distributes chunks to storage nodes via round-robin, stores replica metadata,
 * and cleans up the temporary file.
 */
router.post(
  '/upload',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let createdFileId: number | null = null;
    let fullTempPath: string | null = null;

    try {
      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file uploaded. Please provide a file under the "file" form field',
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User authentication required',
        });
        return;
      }

      const { originalname, size, filename: tempFilename } = req.file;
      fullTempPath = path.join(config.upload.tempDir, tempFilename);

      // 1. Create file record in MySQL with initial 'uploading' status
      const fileRecord = await fileRepository.create(
        req.user.id,
        originalname,
        size,
        0,
        'uploading'
      );
      createdFileId = fileRecord.id;

      // 2. Process file chunking and distribute to storage nodes
      const { file: completedFile, chunks, placements } = await chunkService.processUpload(
        fileRecord.id,
        fullTempPath
      );

      res.status(201).json({
        message: 'File uploaded, chunked, and distributed to storage nodes successfully',
        file: completedFile,
        chunks,
        placements,
      });
    } catch (error) {
      // Ensure temporary file is removed if failure occurred before chunkService handled it
      if (fullTempPath && fs.existsSync(fullTempPath)) {
        try {
          fs.unlinkSync(fullTempPath);
        } catch {
          // ignore unlink error
        }
      }

      // Ensure file record is marked as failed or cleaned up
      if (createdFileId !== null) {
        try {
          await fileRepository.updateStatus(createdFileId, 'failed');
        } catch {
          // ignore status update error on failure path
        }
      }

      next(error);
    }
  }
);

/**
 * GET /api/files
 * List all files belonging to the authenticated user.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User authentication required' });
      return;
    }

    const files = await fileRepository.findByUserId(req.user.id);
    res.json({
      count: files.length,
      files,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/files/:id
 * Retrieve metadata for a specific file owned by the authenticated user along with its chunks and replicas.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User authentication required' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid file ID format' });
      return;
    }

    const file = await fileRepository.findById(fileId);
    if (!file || file.user_id !== req.user.id) {
      res.status(404).json({
        error: 'Not Found',
        message: `File with ID ${fileId} not found`,
      });
      return;
    }

    const chunks = await chunkRepository.findByFileId(fileId);
    const chunksWithReplicas = await Promise.all(
      chunks.map(async (chunk) => {
        const replicas = await chunkReplicaRepository.findByChunkId(chunk.id);
        return {
          ...chunk,
          replicas,
        };
      })
    );

    res.json({
      ...file,
      chunks: chunksWithReplicas,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/files/:id/chunks
 * Retrieve all chunk metadata records for a specific file owned by the authenticated user.
 */
router.get('/:id/chunks', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User authentication required' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid file ID format' });
      return;
    }

    const file = await fileRepository.findById(fileId);
    if (!file || file.user_id !== req.user.id) {
      res.status(404).json({
        error: 'Not Found',
        message: `File with ID ${fileId} not found`,
      });
      return;
    }

    const chunks = await chunkRepository.findByFileId(fileId);

    res.json({
      fileId,
      chunkCount: chunks.length,
      chunks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/files/:id/download
 * Downloads a file by retrieving its chunks in sequential order from healthy storage node replicas,
 * verifying SHA-256 integrity, automatically falling back to alternative replicas if needed,
 * and streaming the reconstructed file to the user without buffering the entire file in RAM.
 */
router.get('/:id/download', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User authentication required' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid file ID format' });
      return;
    }

    const file = await fileRepository.findById(fileId);
    if (!file || file.user_id !== req.user.id) {
      res.status(404).json({ error: 'Not Found', message: `File with ID ${fileId} not found` });
      return;
    }

    if (file.status !== 'complete') {
      res.status(400).json({
        error: 'Bad Request',
        message: `File is in '${file.status}' state and cannot be downloaded`,
      });
      return;
    }

    const chunks = await chunkRepository.findByFileId(fileId);
    if (chunks.length === 0 && file.size > 0) {
      res.status(404).json({ error: 'Not Found', message: 'No chunk metadata found for file' });
      return;
    }

    // Set HTTP streaming headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', file.size.toString());

    if (file.size === 0) {
      res.end();
      return;
    }

    // Load registered nodes into memory map for fast lookup
    const allNodes = await storageNodeRepository.findAll();
    const nodeMap = new Map<number, StorageNodeRecord>(allNodes.map((n) => [n.id, n]));

    // Sequentially retrieve and stream each chunk in original order
    for (const chunk of chunks) {
      const replicas = await chunkReplicaRepository.findByChunkId(chunk.id);
      const activeReplicas = replicas.filter((r) => r.status === 'active');

      if (activeReplicas.length === 0) {
        throw new Error(
          `Download failed: Chunk sequence ${chunk.sequence_number} (${chunk.chunk_id}) has no active replicas recorded.`
        );
      }

      // Download chunk with automatic replica failover & SHA-256 verification
      const chunkBuffer = await storageCoordinator.downloadChunkWithFallback(
        chunk,
        activeReplicas,
        nodeMap
      );

      // Write verified chunk slice to client stream
      res.write(chunkBuffer);
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Download Failed',
        message: (error as Error).message,
      });
    } else {
      res.destroy(error as Error);
    }
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file record and remove any corresponding temporary upload files and chunks.
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'User authentication required' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ error: 'Bad Request', message: 'Invalid file ID format' });
      return;
    }

    const file = await fileRepository.findById(fileId);
    if (!file || file.user_id !== req.user.id) {
      res.status(404).json({
        error: 'Not Found',
        message: `File with ID ${fileId} not found`,
      });
      return;
    }

    // Delete metadata using transactional cascade
    await fileRepository.deleteById(fileId);

    res.json({
      message: 'File deleted successfully',
      fileId,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

