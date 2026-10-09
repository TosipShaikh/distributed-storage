import redis from '../config/redis';
import { config } from '../config';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import {
  NodeRegistrationPayload,
  NodeHeartbeatPayload,
  NodeStatus,
  ClusterStateResponse,
  ClusterNodeInfo,
  StorageNodeRecord,
} from '../types';

export class NodeHealthService {
  private readonly redisKeyPrefix = 'node:health:';
  private readonly redisStatusPrefix = 'node:status:';
  private readonly heartbeatTimeoutMs: number;

  constructor() {
    this.heartbeatTimeoutMs = config.heartbeat?.timeoutMs || 15000;
  }

  /**
   * Register a storage node.
   * Stores persistent information in MySQL and updates fast health state in Redis.
   * Prevents duplicate node registration by upserting into MySQL.
   */
  async registerNode(payload: NodeRegistrationPayload): Promise<StorageNodeRecord> {
    const { nodeId, host, port } = payload;
    const totalCapacity = Number(payload.totalCapacity ?? payload.total_capacity ?? payload.total_storage ?? 0);
    const currentUsage = Number(payload.currentUsage ?? payload.current_usage ?? payload.used_storage ?? 0);

    if (!nodeId || typeof nodeId !== 'string' || nodeId.trim().length === 0) {
      throw new Error('Invalid registration payload: nodeId is required and must be a non-empty string');
    }
    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      throw new Error('Invalid registration payload: host is required and must be a non-empty string');
    }
    if (!port || typeof port !== 'number' || port <= 0 || port > 65535) {
      throw new Error('Invalid registration payload: port must be a valid port number between 1 and 65535');
    }

    console.log(
      `[NodeRegistry] Registering node: '${nodeId}' at ${host}:${port} (Capacity: ${totalCapacity} bytes, Usage: ${currentUsage} bytes)`
    );

    // 1. Persistent Source of Truth: MySQL Upsert
    const nodeRecord = await storageNodeRepository.upsert(
      nodeId,
      host,
      port,
      totalCapacity,
      currentUsage,
      'HEALTHY'
    );

    // 2. Fast Node-Health State: Redis
    await this.setRedisHealth(nodeId, {
      nodeId,
      host,
      port,
      totalCapacity,
      currentUsage,
      status: 'HEALTHY',
      lastHeartbeat: new Date().toISOString(),
    });

    console.log(`[NodeRegistry] Successfully registered node '${nodeId}' with status HEALTHY`);
    return nodeRecord;
  }

  /**
   * Process a periodic heartbeat sent by a storage node.
   * Updates last heartbeat time in MySQL and refreshes Redis health state.
   */
  async recordHeartbeat(payload: NodeHeartbeatPayload): Promise<{
    success: boolean;
    nodeId: string;
    status: NodeStatus;
    lastHeartbeat: string;
  }> {
    const { nodeId } = payload;
    if (!nodeId || typeof nodeId !== 'string') {
      throw new Error('Invalid heartbeat payload: nodeId is required');
    }

    const currentUsage = payload.currentUsage ?? payload.current_usage ?? payload.used_storage;
    const totalCapacity = payload.totalCapacity ?? payload.total_capacity;
    const status: NodeStatus = payload.status || 'HEALTHY';
    const nowIso = new Date().toISOString();

    console.log(
      `[NodeHeartbeat] Heartbeat received from node '${nodeId}' (Status: ${status}, Usage: ${currentUsage ?? 'unchanged'} bytes)`
    );

    // 1. Update Persistent MySQL record
    const existingNode = await storageNodeRepository.findByNodeId(nodeId);
    if (!existingNode) {
      const err = new Error(`Cannot record heartbeat: storage node '${nodeId}' is not registered`);
      (err as any).statusCode = 404;
      throw err;
    }

    await storageNodeRepository.updateHeartbeat(nodeId, currentUsage, totalCapacity, status);

    // 2. Update Fast Redis State
    await this.setRedisHealth(nodeId, {
      nodeId,
      host: existingNode.host,
      port: existingNode.port,
      totalCapacity: totalCapacity ?? existingNode.total_storage,
      currentUsage: currentUsage ?? existingNode.used_storage,
      status,
      lastHeartbeat: nowIso,
    });

    return {
      success: true,
      nodeId,
      status,
      lastHeartbeat: nowIso,
    };
  }

  /**
   * Set status of a node explicitly (e.g. on graceful shutdown -> UNAVAILABLE, or failure -> FAILED).
   */
  async setNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
    console.log(`[NodeHealth] Setting status of node '${nodeId}' to '${status}'`);
    await storageNodeRepository.updateStatus(nodeId, status);

    try {
      const redisKey = `${this.redisKeyPrefix}${nodeId}`;
      const data = await redis.get(redisKey);
      if (data) {
        const parsed = JSON.parse(data);
        parsed.status = status;
        parsed.updatedAt = new Date().toISOString();
        await redis.set(redisKey, JSON.stringify(parsed));
      }
      await redis.set(`${this.redisStatusPrefix}${nodeId}`, status);
    } catch (err) {
      console.warn(`[NodeHealth] Redis update failed for node '${nodeId}':`, (err as Error).message);
    }
  }

  /**
   * Retrieve a specific node by its string nodeId or numeric id.
   * Merges persistent MySQL metadata with fast live Redis health state.
   */
  async getNode(nodeIdOrId: string | number): Promise<ClusterNodeInfo | null> {
    let node: StorageNodeRecord | null = null;
    if (typeof nodeIdOrId === 'number' || /^\d+$/.test(String(nodeIdOrId))) {
      node = await storageNodeRepository.findById(Number(nodeIdOrId));
    } else {
      node = await storageNodeRepository.findByNodeId(nodeIdOrId);
    }

    if (!node) {
      return null;
    }

    return this.enrichNodeWithLiveState(node);
  }

  /**
   * Retrieve all registered storage nodes with live health state.
   */
  async getAllNodes(): Promise<ClusterNodeInfo[]> {
    // MySQL is the permanent source of truth for node registry
    const persistentNodes = await storageNodeRepository.findAll();
    return Promise.all(persistentNodes.map((n) => this.enrichNodeWithLiveState(n)));
  }

  /**
   * Get the complete current cluster state.
   * Returns cluster-wide capacity metrics, node count, health distribution, and all nodes.
   */
  async getClusterState(): Promise<ClusterStateResponse> {
    const nodes = await this.getAllNodes();

    let totalCapacity = 0;
    let currentUsage = 0;
    let healthyCount = 0;
    let unavailableCount = 0;
    let failedCount = 0;

    for (const node of nodes) {
      totalCapacity += node.totalCapacity;
      currentUsage += node.currentUsage;

      if (node.status === 'HEALTHY' || node.status === 'online') {
        healthyCount++;
      } else if (node.status === 'UNAVAILABLE' || node.status === 'offline') {
        unavailableCount++;
      } else if (node.status === 'FAILED') {
        failedCount++;
      }
    }

    const replicationFactor = config.storage?.replicationFactor || 2;
    let clusterStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';

    if (healthyCount === 0 || healthyCount < replicationFactor) {
      clusterStatus = 'CRITICAL';
    } else if (healthyCount < nodes.length) {
      clusterStatus = 'DEGRADED';
    }

    return {
      cluster: {
        status: clusterStatus,
        totalNodes: nodes.length,
        healthyNodes: healthyCount,
        unavailableNodes: unavailableCount,
        failedNodes: failedCount,
        totalCapacity,
        currentUsage,
        availableCapacity: Math.max(0, totalCapacity - currentUsage),
        replicationFactor,
        timestamp: new Date().toISOString(),
      },
      nodes,
    };
  }

  /**
   * Enrich persistent MySQL node record with fast Redis live state and heartbeat timeout checking.
   */
  private async enrichNodeWithLiveState(node: StorageNodeRecord): Promise<ClusterNodeInfo> {
    let liveStatus: NodeStatus = node.status;
    let lastHeartbeatStr = node.last_heartbeat ? new Date(node.last_heartbeat).toISOString() : null;
    let liveStateSource: 'redis' | 'mysql' = 'mysql';

    try {
      const redisKey = `${this.redisKeyPrefix}${node.node_id}`;
      const cached = await redis.get(redisKey);
      if (cached) {
        liveStateSource = 'redis';
        const parsed = JSON.parse(cached);
        if (parsed.status) {
          liveStatus = parsed.status;
        }
        if (parsed.lastHeartbeat) {
          lastHeartbeatStr = parsed.lastHeartbeat;
        }
      }
    } catch {
      // Redis unavailable; use MySQL state
    }

    // Check if heartbeat is timed out (> heartbeatTimeoutMs)
    if (lastHeartbeatStr && (liveStatus === 'HEALTHY' || liveStatus === 'online')) {
      const lastHbTime = new Date(lastHeartbeatStr).getTime();
      const elapsed = Date.now() - lastHbTime;
      if (elapsed > this.heartbeatTimeoutMs) {
        liveStatus = 'UNAVAILABLE';
      }
    } else if (!lastHeartbeatStr && (liveStatus === 'HEALTHY' || liveStatus === 'online')) {
      liveStatus = 'UNAVAILABLE';
    }

    return {
      id: node.id,
      nodeId: node.node_id,
      host: node.host,
      port: node.port,
      totalCapacity: node.total_storage,
      currentUsage: node.used_storage,
      status: liveStatus,
      lastHeartbeat: lastHeartbeatStr,
      sourceOfTruth: 'mysql',
      liveState: liveStateSource,
    };
  }

  /**
   * Store node health state in Redis with safety fallback.
   */
  private async setRedisHealth(
    nodeId: string,
    state: {
      nodeId: string;
      host: string;
      port: number;
      totalCapacity: number;
      currentUsage: number;
      status: NodeStatus;
      lastHeartbeat: string;
    }
  ): Promise<void> {
    try {
      const redisKey = `${this.redisKeyPrefix}${nodeId}`;
      const statusKey = `${this.redisStatusPrefix}${nodeId}`;
      const serialized = JSON.stringify(state);

      // Keep key in Redis; TTL is 4x heartbeat interval for safety
      const ttlSeconds = Math.max(60, Math.ceil((this.heartbeatTimeoutMs * 2) / 1000));
      await redis.setex(redisKey, ttlSeconds, serialized);
      await redis.setex(statusKey, ttlSeconds, state.status);
    } catch (err) {
      console.warn(`[NodeHealth] Redis set failed for node '${nodeId}':`, (err as Error).message);
    }
  }
}

export const nodeHealthService = new NodeHealthService();
