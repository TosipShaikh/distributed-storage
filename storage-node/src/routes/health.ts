import { Router, Request, Response } from 'express';
import fs from 'fs';
import { config } from '../config';
import { HealthResponse } from '../types';

const router = Router();

/**
 * GET /health
 * Returns status, nodeId, uptime of the storage node.
 */
router.get('/health', (_req: Request, res: Response) => {
  let dataDirAccessible = false;
  try {
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    fs.accessSync(config.dataDir, fs.constants.R_OK | fs.constants.W_OK);
    dataDirAccessible = true;
  } catch {
    dataDirAccessible = false;
  }

  const response: HealthResponse = {
    nodeId: config.nodeId,
    status: dataDirAccessible ? 'ok' : 'error',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    dataDir: config.dataDir,
  };

  const statusCode = dataDirAccessible ? 200 : 503;
  res.status(statusCode).json(response);
});

export default router;
