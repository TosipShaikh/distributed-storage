import { Router, Request, Response } from 'express';
import { config } from '../config';
import { StorageNodeStatus, NodesResponse } from '../types';

const router = Router();

/**
 * GET /api/nodes
 * Pings all configured storage nodes and returns their status.
 */
router.get('/nodes', async (_req: Request, res: Response) => {
  const nodeStatuses: StorageNodeStatus[] = await Promise.all(
    config.storageNodes.map(async (nodeUrl): Promise<StorageNodeStatus> => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${nodeUrl}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = (await response.json()) as { nodeId?: string; uptime?: number };
          return {
            url: nodeUrl,
            status: 'online',
            nodeId: data.nodeId,
            uptime: data.uptime,
          };
        }

        return {
          url: nodeUrl,
          status: 'offline',
          error: `HTTP ${response.status}`,
        };
      } catch (error) {
        return {
          url: nodeUrl,
          status: 'offline',
          error: (error as Error).message,
        };
      }
    })
  );

  const onlineNodes = nodeStatuses.filter((n) => n.status === 'online').length;

  const response: NodesResponse = {
    totalNodes: nodeStatuses.length,
    onlineNodes,
    nodes: nodeStatuses,
  };

  res.json(response);
});

export default router;
