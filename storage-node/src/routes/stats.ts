import { Router, Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storageService';

const router = Router();

/**
 * GET /stats
 * Returns storage usage and chunk count statistics.
 */
router.get('/stats', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = storageService.getStats();
    res.status(200).json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
