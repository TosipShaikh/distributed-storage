import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { storageService } from '../services/storageService';
import { validateAndResolveChunkPath } from '../utils/validation';
import { config } from '../config';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit per chunk
});

/**
 * Helper to process upload request body across raw, json, and multipart inputs.
 */
function extractChunkPayload(req: Request): { chunkId: string | null; buffer: Buffer | null; error?: string } {
  let chunkId: string | null = null;
  let buffer: Buffer | null = null;

  // 1. Check headers / query params first
  if (typeof req.headers['x-chunk-id'] === 'string') {
    chunkId = req.headers['x-chunk-id'];
  } else if (typeof req.query.chunkId === 'string') {
    chunkId = req.query.chunkId;
  } else if (typeof req.query.id === 'string') {
    chunkId = req.query.id;
  }

  // 2. Check req.file from multer
  if (req.file) {
    buffer = req.file.buffer;
    if (!chunkId) {
      chunkId = req.body?.chunkId || req.body?.id || req.file.originalname;
    }
  }

  // 3. Check raw Buffer body
  if (!buffer && Buffer.isBuffer(req.body)) {
    buffer = req.body;
  }

  // 4. Check JSON body
  if (!buffer && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (!chunkId) {
      chunkId = req.body.chunkId || req.body.id || null;
    }

    if (req.body.data) {
      // Check if data is base64 encoded
      const rawData = req.body.data;
      if (typeof rawData === 'string') {
        const isBase64 = /^data:.*;base64,/.test(rawData) || /^[A-Za-z0-9+/=]+$/.test(rawData);
        const base64Content = rawData.replace(/^data:.*;base64,/, '');
        buffer = Buffer.from(base64Content, isBase64 ? 'base64' : 'utf-8');
      } else if (Buffer.isBuffer(rawData)) {
        buffer = rawData;
      }
    } else if (req.body.content) {
      buffer = Buffer.from(req.body.content, 'utf-8');
    }
  }

  if (!chunkId && req.body?.chunkId) {
    chunkId = req.body.chunkId;
  }

  return { chunkId, buffer };
}

/**
 * POST /chunks
 * Upload and store a binary chunk.
 */
router.post('/chunks', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chunkId, buffer } = extractChunkPayload(req);

    if (!chunkId) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Missing chunkId. Pass chunkId via x-chunk-id header, ?chunkId= query param, or JSON/form body.',
      });
      return;
    }

    if (!buffer || buffer.length === 0) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Empty or missing binary chunk content.',
      });
      return;
    }

    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);
    if (!validation.valid) {
      res.status(400).json({
        error: 'INVALID_CHUNK_ID',
        message: validation.error,
      });
      return;
    }

    const result = await storageService.saveChunk(chunkId, buffer);

    res.status(201).json({
      success: true,
      message: `Chunk '${chunkId}' stored successfully.`,
      nodeId: config.nodeId,
      chunkId,
      size: result.size,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /chunks/:chunkId
 * Alternative route to upload a chunk by explicit ID path parameter.
 */
router.post('/chunks/:chunkId', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chunkId: paramChunkId } = req.params;
    const validation = validateAndResolveChunkPath(paramChunkId, config.dataDir);

    if (!validation.valid) {
      res.status(400).json({
        error: 'INVALID_CHUNK_ID',
        message: validation.error,
      });
      return;
    }

    let buffer: Buffer | null = null;
    if (req.file) {
      buffer = req.file.buffer;
    } else if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body?.data) {
      buffer = Buffer.from(req.body.data, 'utf-8');
    } else if (req.body?.content) {
      buffer = Buffer.from(req.body.content, 'utf-8');
    }

    if (!buffer || buffer.length === 0) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'Empty or missing binary chunk content.',
      });
      return;
    }

    const result = await storageService.saveChunk(paramChunkId, buffer);

    res.status(201).json({
      success: true,
      message: `Chunk '${paramChunkId}' stored successfully.`,
      nodeId: config.nodeId,
      chunkId: paramChunkId,
      size: result.size,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /chunks/:chunkId
 * Retrieve a stored binary chunk by chunk ID.
 */
router.get('/chunks/:chunkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chunkId } = req.params;
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);

    if (!validation.valid) {
      res.status(400).json({
        error: 'INVALID_CHUNK_ID',
        message: validation.error,
      });
      return;
    }

    try {
      const buffer = await storageService.readChunk(chunkId);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${chunkId}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.status(200).send(buffer);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Chunk '${chunkId}' not found on node '${config.nodeId}'.`,
        });
        return;
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /chunks/:chunkId
 * Delete a chunk from the node filesystem.
 */
router.delete('/chunks/:chunkId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chunkId } = req.params;
    const validation = validateAndResolveChunkPath(chunkId, config.dataDir);

    if (!validation.valid) {
      res.status(400).json({
        error: 'INVALID_CHUNK_ID',
        message: validation.error,
      });
      return;
    }

    try {
      await storageService.deleteChunk(chunkId);
      res.status(200).json({
        success: true,
        message: `Chunk '${chunkId}' deleted successfully from node '${config.nodeId}'.`,
        nodeId: config.nodeId,
        chunkId,
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: `Chunk '${chunkId}' not found on node '${config.nodeId}'.`,
        });
        return;
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

export default router;
