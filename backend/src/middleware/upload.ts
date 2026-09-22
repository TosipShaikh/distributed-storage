import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';

// Ensure the temporary uploads directory exists
if (!fs.existsSync(config.upload.tempDir)) {
  fs.mkdirSync(config.upload.tempDir, { recursive: true });
}

/**
 * Configure Multer disk storage for temporary incoming file uploads.
 * Files are kept isolated in the temporary directory prior to chunking/distribution.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.upload.tempDir)) {
      fs.mkdirSync(config.upload.tempDir, { recursive: true });
    }
    cb(null, config.upload.tempDir);
  },
  filename: (_req, file, cb) => {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const sanitizedExt = path.extname(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '');
    const baseName = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 50);

    const tempFilename = `temp_${Date.now()}_${randomSuffix}_${baseName}${sanitizedExt}`;
    cb(null, tempFilename);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSize,
  },
});
