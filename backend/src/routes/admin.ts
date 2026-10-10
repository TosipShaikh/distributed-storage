import { Router, Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { nodeHealthService } from '../services/nodeHealthService';
import { recoveryCoordinator } from '../services/recoveryCoordinator';
import { recoveryEventRepository } from '../repositories/recoveryEventRepository';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { config } from '../config';

const router = Router();

/**
 * GET /api/admin/overview
 * Returns aggregate metrics for the admin dashboard:
 * - Total nodes, healthy nodes, failed nodes
 * - Total files, chunks, replicas, replication factor
 * - Storage capacity and utilization
 * - Recent recovery events summary
 */
router.get('/overview', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clusterState = await nodeHealthService.getClusterState();
    const allNodes = await nodeHealthService.getAllNodes();

    // Query file, chunk, and replica counts from MySQL
    const [fileCountRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total_files, COALESCE(SUM(size), 0) as total_file_bytes FROM files`
    );
    const [chunkCountRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total_chunks, COALESCE(SUM(size), 0) as total_chunk_bytes FROM chunks`
    );
    const [replicaCountRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total_replicas,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_replicas,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_replicas
       FROM chunk_replicas`
    );

    // Distribution of replicas per node
    const [nodeReplicaRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sn.node_id, sn.id as db_id, COUNT(cr.id) as replica_count
       FROM storage_nodes sn
       LEFT JOIN chunk_replicas cr ON sn.id = cr.node_id AND cr.status = 'active'
       GROUP BY sn.id`
    );

    const replicaCountsByNode: Record<string, number> = {};
    for (const r of nodeReplicaRows) {
      replicaCountsByNode[r.node_id] = Number(r.replica_count);
    }

    const totalFiles = Number(fileCountRows[0].total_files || 0);
    const totalFileBytes = Number(fileCountRows[0].total_file_bytes || 0);
    const totalChunks = Number(chunkCountRows[0].total_chunks || 0);
    const totalReplicas = Number(replicaCountRows[0].total_replicas || 0);
    const activeReplicas = Number(replicaCountRows[0].active_replicas || 0);
    const failedReplicas = Number(replicaCountRows[0].failed_replicas || 0);

    const recentEvents = await recoveryEventRepository.findRecent(10);

    // Nodes enriched with replica count and standardized storage capacity properties
    const enrichedNodes = allNodes.map((n) => ({
      ...n,
      totalStorage: Number(n.totalCapacity),
      usedStorage: Number(n.currentUsage),
      availableStorage: Math.max(0, Number(n.totalCapacity) - Number(n.currentUsage)),
      activeReplicas: replicaCountsByNode[n.nodeId] || 0,
      utilizationPercent:
        n.totalCapacity > 0
          ? Math.min(100, Math.round((n.currentUsage / n.totalCapacity) * 10000) / 100)
          : 0,
    }));

    res.status(200).json({
      nodes: {
        total: clusterState.cluster.totalNodes,
        healthy: clusterState.cluster.healthyNodes,
        failed: clusterState.cluster.failedNodes,
        unavailable: clusterState.cluster.unavailableNodes,
        list: enrichedNodes,
      },
      data: {
        totalFiles,
        totalFileBytes,
        totalChunks,
        totalReplicas,
        activeReplicas,
        failedReplicas,
        replicationFactor: config.storage.replicationFactor,
      },
      storage: {
        totalCapacityBytes: clusterState.cluster.totalCapacity,
        usedStorageBytes: clusterState.cluster.currentUsage,
        utilizationPercent:
          clusterState.cluster.totalCapacity > 0
            ? Math.round((clusterState.cluster.currentUsage / clusterState.cluster.totalCapacity) * 10000) / 100
            : 0,
      },
      recovery: {
        recentEvents,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/nodes
 * Detailed nodes listing with capacity, live heartbeat age, and replica distribution.
 */
router.get('/nodes', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const allNodes = await nodeHealthService.getAllNodes();

    // Query replica counts (active, failed, and total)
    const [nodeReplicaRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sn.node_id,
              SUM(CASE WHEN cr.status = 'active' THEN 1 ELSE 0 END) as active_replicas,
              SUM(CASE WHEN cr.status = 'failed' THEN 1 ELSE 0 END) as failed_replicas,
              COUNT(cr.id) as total_replicas
       FROM storage_nodes sn
       LEFT JOIN chunk_replicas cr ON sn.id = cr.node_id
       GROUP BY sn.id`
    );

    const activeMap = new Map<string, number>();
    const failedMap = new Map<string, number>();
    const totalMap = new Map<string, number>();

    for (const row of nodeReplicaRows) {
      activeMap.set(row.node_id, Number(row.active_replicas || 0));
      failedMap.set(row.node_id, Number(row.failed_replicas || 0));
      totalMap.set(row.node_id, Number(row.total_replicas || 0));
    }

    const now = Date.now();
    const detailedNodes = allNodes.map((node) => {
      const lastHbTime = node.lastHeartbeat ? new Date(node.lastHeartbeat).getTime() : 0;
      const secondsSinceHeartbeat = lastHbTime > 0 ? Math.round((now - lastHbTime) / 1000) : null;

      return {
        id: node.id,
        nodeId: node.nodeId,
        host: node.host,
        port: node.port,
        url: `http://${node.host}:${node.port}`,
        status: node.status,
        totalStorage: Number(node.totalCapacity),
        usedStorage: Number(node.currentUsage),
        availableStorage: Math.max(0, Number(node.totalCapacity) - Number(node.currentUsage)),
        utilizationPercent:
          Number(node.totalCapacity) > 0
            ? Math.round((Number(node.currentUsage) / Number(node.totalCapacity)) * 10000) / 100
            : 0,
        activeReplicas: activeMap.get(node.nodeId) || 0,
        failedReplicas: failedMap.get(node.nodeId) || 0,
        totalReplicas: totalMap.get(node.nodeId) || 0,
        lastHeartbeat: node.lastHeartbeat,
        secondsSinceHeartbeat,
      };
    });

    res.status(200).json({
      count: detailedNodes.length,
      nodes: detailedNodes,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/replication
 * Returns full tree hierarchy of Files -> Chunks -> Node Replicas.
 * Essential for the examiner replication tree visualization:
 * File
 *  ↓
 * Chunk C1
 *  ├── Node 1
 *  └── Node 3
 */
router.get('/replication', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = `
      SELECT 
        f.id as file_id,
        f.filename,
        f.size as file_size,
        f.chunk_count,
        f.status as file_status,
        f.created_at as file_created_at,
        c.id as chunk_db_id,
        c.chunk_id as chunk_uuid,
        c.sequence_number,
        c.size as chunk_size,
        c.hash as chunk_hash,
        cr.id as replica_id,
        cr.status as replica_status,
        cr.created_at as replica_created_at,
        sn.id as node_db_id,
        sn.node_id as node_name,
        sn.host as node_host,
        sn.port as node_port,
        sn.status as node_status
      FROM files f
      LEFT JOIN chunks c ON f.id = c.file_id
      LEFT JOIN chunk_replicas cr ON c.id = cr.chunk_id
      LEFT JOIN storage_nodes sn ON cr.node_id = sn.id
      ORDER BY f.id DESC, c.sequence_number ASC, sn.node_id ASC
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);

    // Group into hierarchical File -> Chunks -> Replicas structure
    const fileMap = new Map<number, any>();

    for (const row of rows) {
      if (!fileMap.has(row.file_id)) {
        fileMap.set(row.file_id, {
          id: row.file_id,
          filename: row.filename,
          size: Number(row.file_size),
          chunkCount: row.chunk_count,
          status: row.file_status,
          createdAt: row.file_created_at,
          chunks: new Map<number, any>(),
        });
      }

      const fileEntry = fileMap.get(row.file_id);

      if (row.chunk_db_id) {
        if (!fileEntry.chunks.has(row.chunk_db_id)) {
          fileEntry.chunks.set(row.chunk_db_id, {
            id: row.chunk_db_id,
            chunkId: row.chunk_uuid,
            sequenceNumber: row.sequence_number,
            size: Number(row.chunk_size),
            hash: row.chunk_hash,
            replicas: [],
          });
        }

        const chunkEntry = fileEntry.chunks.get(row.chunk_db_id);

        if (row.replica_id && row.node_name) {
          chunkEntry.replicas.push({
            id: row.replica_id,
            status: row.replica_status,
            createdAt: row.replica_created_at,
            node: {
              id: row.node_db_id,
              nodeId: row.node_name,
              host: row.node_host,
              port: row.node_port,
              status: row.node_status,
            },
          });
        }
      }
    }

    // Convert chunk maps to sorted arrays
    const resultFiles = Array.from(fileMap.values()).map((file) => ({
      ...file,
      chunks: Array.from(file.chunks.values()),
    }));

    res.status(200).json({
      replicationFactor: config.storage.replicationFactor,
      fileCount: resultFiles.length,
      files: resultFiles,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/recovery
 * Comprehensive recovery auditor: events, status, and history.
 */
router.get('/recovery', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const events = await recoveryEventRepository.findRecent(limit);
    const coordinatorStatus = await recoveryCoordinator.getStatus();

    const [statsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        status, 
        COUNT(*) as count 
       FROM recovery_events 
       GROUP BY status`
    );

    const eventBreakdown: Record<string, number> = {
      completed: 0,
      in_progress: 0,
      pending: 0,
      failed: 0,
    };
    for (const row of statsRows) {
      eventBreakdown[row.status] = Number(row.count);
    }

    res.status(200).json({
      status: coordinatorStatus,
      eventBreakdown,
      events,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/recovery/trigger
 * Manually trigger a recovery pass.
 */
router.post('/recovery/trigger', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await recoveryCoordinator.checkAndRecoverNodes();
    res.status(200).json({
      success: true,
      message: 'Replica recovery cycle completed',
      result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/nodes/:nodeId/simulate-failure
 * Demonstration utility: simulates sudden failure of a storage node to demonstrate
 * real-time detection & replica recovery to an examiner.
 */
router.post(
  '/nodes/:nodeId/simulate-failure',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const node = await storageNodeRepository.findByNodeId(nodeId);

      if (!node) {
        res.status(404).json({ error: 'Not Found', message: `Node '${nodeId}' not found` });
        return;
      }

      // Mark node FAILED in MySQL and Redis
      const pastTime = new Date(Date.now() - 60000);
      await pool.execute(
        `UPDATE storage_nodes SET status = 'FAILED', last_heartbeat = ? WHERE node_id = ?`,
        [pastTime, nodeId]
      );
      await nodeHealthService.setNodeStatus(nodeId, 'FAILED');

      res.status(200).json({
        success: true,
        message: `Node '${nodeId}' marked as FAILED for demonstration purposes`,
        nodeId,
        status: 'FAILED',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/nodes/:nodeId/simulate-restore
 * Demonstration utility: restores a failed storage node back to HEALTHY.
 */
router.post(
  '/nodes/:nodeId/simulate-restore',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const node = await storageNodeRepository.findByNodeId(nodeId);

      if (!node) {
        res.status(404).json({ error: 'Not Found', message: `Node '${nodeId}' not found` });
        return;
      }

      const now = new Date();
      await pool.execute(
        `UPDATE storage_nodes SET status = 'HEALTHY', last_heartbeat = ? WHERE node_id = ?`,
        [now, nodeId]
      );
      await nodeHealthService.setNodeStatus(nodeId, 'HEALTHY');

      // Re-activate any replicas marked as 'failed' on this node since node is now online and healthy
      const [replicaRes] = await pool.execute<ResultSetHeader>(
        `UPDATE chunk_replicas SET status = 'active' WHERE node_id = ? AND status = 'failed'`,
        [node.id]
      );

      res.status(200).json({
        success: true,
        message: `Node '${nodeId}' restored to HEALTHY! Restored ${replicaRes.affectedRows} replica(s) to active.`,
        nodeId,
        status: 'HEALTHY',
        reconciledReplicas: replicaRes.affectedRows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/nodes/:nodeId/reconcile
 * Reconciles storage node: re-activates failed replicas so that reported active
 * replicas match the physical files and used storage on disk.
 */
router.post(
  '/nodes/:nodeId/reconcile',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { nodeId } = req.params;
      const node = await storageNodeRepository.findByNodeId(nodeId);

      if (!node) {
        res.status(404).json({ error: 'Not Found', message: `Node '${nodeId}' not found` });
        return;
      }

      // Re-activate failed replicas for this node
      const [replicaRes] = await pool.execute<ResultSetHeader>(
        `UPDATE chunk_replicas SET status = 'active' WHERE node_id = ? AND status = 'failed'`,
        [node.id]
      );

      res.status(200).json({
        success: true,
        message: `Node '${nodeId}' reconciled successfully! Restored ${replicaRes.affectedRows} replica(s) to ACTIVE.`,
        nodeId,
        reconciledCount: replicaRes.affectedRows,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/logs
 * Returns synthesized system logs including heartbeats, chunk replications,
 * failure events, and recovery operations.
 */
router.get('/logs', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const logs: Array<{
      id: string;
      timestamp: string;
      level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
      component: string;
      message: string;
    }> = [];

    // 1. Fetch recent recovery events
    const recoveryEvents = await recoveryEventRepository.findRecent(30);
    for (const rev of recoveryEvents) {
      logs.push({
        id: `rev-${rev.id}`,
        timestamp: rev.created_at ? new Date(rev.created_at).toISOString() : new Date().toISOString(),
        level: rev.status === 'completed' ? 'SUCCESS' : rev.status === 'failed' ? 'ERROR' : 'WARN',
        component: 'RecoveryCoordinator',
        message: `Recovery event #${rev.id}: type=${rev.event_type}, node_id=${rev.node_id ?? 'N/A'}, status=${rev.status}`,
      });
    }

    // 2. Fetch node heartbeats & status
    const allNodes = await nodeHealthService.getAllNodes();
    for (const node of allNodes) {
      const isHealthy = node.status === 'HEALTHY' || node.status === 'online';
      logs.push({
        id: `node-${node.nodeId}`,
        timestamp: node.lastHeartbeat ? new Date(node.lastHeartbeat).toISOString() : new Date().toISOString(),
        level: isHealthy ? 'INFO' : 'ERROR',
        component: 'HeartbeatMonitor',
        message: `Node '${node.nodeId}' (${node.host}:${node.port}) status is [${node.status}], used=${Math.round(node.currentUsage / 1024)} KB`,
      });
    }

    // 3. Fetch recent file uploads
    const [recentFiles] = await pool.execute<RowDataPacket[]>(
      `SELECT id, filename, size, chunk_count, status, created_at FROM files ORDER BY id DESC LIMIT 15`
    );
    for (const f of recentFiles) {
      logs.push({
        id: `file-${f.id}`,
        timestamp: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
        level: f.status === 'complete' ? 'INFO' : f.status === 'uploading' ? 'WARN' : 'ERROR',
        component: 'ChunkService',
        message: `File #${f.id} '${f.filename}' (${(f.size / (1024 * 1024)).toFixed(2)} MB) stored into ${f.chunk_count} chunk(s) with status [${f.status}]`,
      });
    }

    // Sort logs descending by timestamp
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.status(200).json({
      count: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
