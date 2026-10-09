import { Router, Request, Response, NextFunction } from 'express';
import { nodeHealthService } from '../services/nodeHealthService';

const router = Router();

/**
 * GET /api/storage-nodes
 * List all registered storage nodes with live health state.
 */
router.get('/storage-nodes', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const nodes = await nodeHealthService.getAllNodes();
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
    const node = await nodeHealthService.getNode(nodeId);

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
