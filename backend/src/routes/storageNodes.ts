import { Router, Request, Response, NextFunction } from 'express';
import { storageNodeRepository } from '../repositories/storageNodeRepository';

const router = Router();

/**
 * GET /api/storage-nodes
 * List all registered storage nodes from the MySQL metadata database.
 */
router.get('/storage-nodes', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const nodes = await storageNodeRepository.findAll();
    res.json({
      count: nodes.length,
      nodes,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/storage-nodes/:nodeId
 * Get metadata for a specific storage node by its nodeId.
 */
router.get('/storage-nodes/:nodeId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const node = await storageNodeRepository.findByNodeId(nodeId);

    if (!node) {
      res.status(404).json({
        error: 'Not Found',
        message: `Storage node '${nodeId}' not found in registry`,
      });
      return;
    }

    res.json(node);
  } catch (error) {
    next(error);
  }
});

export default router;
