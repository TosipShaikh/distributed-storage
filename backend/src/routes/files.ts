import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileRepository } from '../repositories/fileRepository';
import { authenticateToken } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';
import { config } from '../config';

const router = Router();

// Protect all file management routes with JWT authentication
router.use(authenticateToken);

/**
 * POST /api/files/upload
 * Accepts an uploaded file, stores it temporarily, and creates the file metadata record.
 * Chunks are NOT distributed to storage nodes at this stage.
 */
router.post(
  '/upload',
  uploadMiddleware.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      // Create file metadata in MySQL
      const fileRecord = await fileRepository.create(
        req.user.id,
        originalname,
        size,
        0, // chunk_count: 0 initially (chunk distribution will happen in Step 5)
        'complete'
      );

      res.status(201).json({
        message: 'File uploaded and metadata recorded successfully',
        file: {
          ...fileRecord,
          tempPath: tempFilename,
        },
      });
    } catch (error) {
      // If error occurs after file write, clean up temporary file
      if (req.file) {
        const fullTempPath = path.join(config.upload.tempDir, req.file.filename);
        if (fs.existsSync(fullTempPath)) {
          try {
            fs.unlinkSync(fullTempPath);
          } catch {
            // ignore unlink errors on failure
          }
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
 * Retrieve metadata for a specific file owned by the authenticated user.
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

    res.json(file);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file record and remove any corresponding temporary upload files.
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
