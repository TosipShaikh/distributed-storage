import { Router, Request, Response, NextFunction } from 'express';
import { nodeHealthService } from '../services/nodeHealthService';
import { recoveryCoordinator } from '../services/recoveryCoordinator';
import { recoveryEventRepository } from '../repositories/recoveryEventRepository';

const router = Router();

/**
 * POST /api/nodes/register
 * Register a storage node with the backend coordinator.
 * Prevents duplicate registration by upserting in MySQL and updating Redis fast health cache.
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { nodeId, host, port } = req.body;

    if (!nodeId || !host || !port) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'nodeId, host, and port are required for node registration',
      });
      return;
    }

    const nodeRecord = await nodeHealthService.registerNode(req.body);

    res.status(200).json({
      success: true,
      message: `Node '${nodeId}' registered successfully`,
      node: {
        id: nodeRecord.id,
        nodeId: nodeRecord.node_id,
        host: nodeRecord.host,
        port: nodeRecord.port,
        totalCapacity: nodeRecord.total_storage,
        currentUsage: nodeRecord.used_storage,
        status: nodeRecord.status,
        lastHeartbeat: nodeRecord.last_heartbeat,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/nodes/heartbeat
 * Periodic heartbeat sent by a storage node to update health state in Redis and MySQL.
 */
router.post('/heartbeat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { nodeId } = req.body;

    if (!nodeId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'nodeId is required for heartbeat',
      });
      return;
    }

    const result = await nodeHealthService.recordHeartbeat(req.body);

    res.status(200).json({
      success: true,
      message: 'Heartbeat acknowledged',
      nodeId: result.nodeId,
      status: result.status,
      timestamp: result.lastHeartbeat,
    });
  } catch (error: any) {
    if (error.statusCode === 404) {
      res.status(404).json({
        error: 'Not Found',
        message: error.message,
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/nodes/cluster/state (and /cluster)
 * Returns the complete cluster state including node counts, capacity metrics, and live status.
 */
const handleClusterState = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clusterState = await nodeHealthService.getClusterState();
    res.status(200).json(clusterState);
  } catch (error) {
    next(error);
  }
};

router.get('/cluster/state', handleClusterState);
router.get('/cluster', handleClusterState);

/**
 * GET /api/nodes/recovery/status
 * Returns current status and statistics for automated node failure detection & recovery.
 */
router.get('/recovery/status', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const status = await recoveryCoordinator.getStatus();
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/nodes/recovery/events
 * Returns recent failure detection and recovery events from the database.
 */
router.get('/recovery/events', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const events = await recoveryEventRepository.findRecent(limit);
    res.status(200).json({ count: events.length, events });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/nodes/recovery/trigger
 * Manually trigger a node failure check and replica recovery pass.
 */
router.post('/recovery/trigger', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await recoveryCoordinator.checkAndRecoverNodes();
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/nodes
 * Returns all registered storage nodes with merged MySQL persistent metadata and Redis live state.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const nodes = await nodeHealthService.getAllNodes();
    const onlineNodes = nodes.filter((n) => n.status === 'HEALTHY' || n.status === 'online').length;

    res.status(200).json({
      totalNodes: nodes.length,
      onlineNodes,
      count: nodes.length,
      nodes: nodes.map((n) => ({
        ...n,
        url: `http://${n.host}:${n.port}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/nodes/:id
 * Retrieve details for a specific storage node by its string nodeId or numeric id.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const node = await nodeHealthService.getNode(id);

    if (!node) {
      res.status(404).json({
        error: 'Not Found',
        message: `Storage node '${id}' not found in registry`,
      });
      return;
    }

    res.status(200).json(node);
  } catch (error) {
    next(error);
  }
});

export default router;
