import { NodeHealthService } from '../services/nodeHealthService';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { StorageNodeRecord, NodeStatus } from '../types';
import redis from '../config/redis';

// Mock storageNodeRepository and redis for isolated unit/integration tests
describe('Step 8: Storage Node Management Subsystem', () => {
  let service: NodeHealthService;

  // In-memory mock database for storage_nodes (MySQL simulation)
  let mockDatabase: Map<string, StorageNodeRecord>;
  let idCounter = 1;

  // In-memory mock Redis cache
  let mockRedis: Map<string, string>;

  beforeEach(() => {
    mockDatabase = new Map<string, StorageNodeRecord>();
    mockRedis = new Map<string, string>();
    idCounter = 1;

    // Mock storageNodeRepository methods
    jest.spyOn(storageNodeRepository, 'upsert').mockImplementation(
      async (
        nodeId: string,
        host: string,
        port: number,
        totalStorage: number = 0,
        usedStorage: number = 0,
        status: NodeStatus = 'HEALTHY'
      ): Promise<StorageNodeRecord> => {
        const existing = mockDatabase.get(nodeId);
        const record: StorageNodeRecord = {
          id: existing ? existing.id : idCounter++,
          node_id: nodeId,
          host,
          port,
          total_storage: totalStorage,
          used_storage: usedStorage,
          status,
          last_heartbeat: new Date(),
          created_at: existing ? existing.created_at : new Date(),
        };
        mockDatabase.set(nodeId, record);
        return record;
      }
    );

    jest.spyOn(storageNodeRepository, 'findByNodeId').mockImplementation(
      async (nodeId: string): Promise<StorageNodeRecord | null> => {
        return mockDatabase.get(nodeId) || null;
      }
    );

    jest.spyOn(storageNodeRepository, 'findById').mockImplementation(
      async (id: number): Promise<StorageNodeRecord | null> => {
        for (const record of mockDatabase.values()) {
          if (record.id === id) return record;
        }
        return null;
      }
    );

    jest.spyOn(storageNodeRepository, 'findAll').mockImplementation(
      async (): Promise<StorageNodeRecord[]> => {
        return Array.from(mockDatabase.values()).sort((a, b) => a.id - b.id);
      }
    );

    jest.spyOn(storageNodeRepository, 'updateHeartbeat').mockImplementation(
      async (
        nodeId: string,
        usedStorage?: number,
        totalStorage?: number,
        status: NodeStatus = 'HEALTHY'
      ): Promise<void> => {
        const record = mockDatabase.get(nodeId);
        if (record) {
          record.last_heartbeat = new Date();
          record.status = status;
          if (usedStorage !== undefined) record.used_storage = usedStorage;
          if (totalStorage !== undefined) record.total_storage = totalStorage;
        }
      }
    );

    jest.spyOn(storageNodeRepository, 'updateStatus').mockImplementation(
      async (nodeId: string, status: NodeStatus): Promise<void> => {
        const record = mockDatabase.get(nodeId);
        if (record) {
          record.status = status;
        }
      }
    );

    // Mock Redis
    jest.spyOn(redis, 'setex').mockImplementation(
      async (key: any, _seconds: any, value: any): Promise<any> => {
        mockRedis.set(String(key), String(value));
        return 'OK';
      }
    );

    jest.spyOn(redis, 'set').mockImplementation(
      async (key: any, value: any): Promise<any> => {
        mockRedis.set(String(key), String(value));
        return 'OK';
      }
    );

    jest.spyOn(redis, 'get').mockImplementation(
      async (key: any): Promise<any> => {
        return mockRedis.get(String(key)) || null;
      }
    );

    service = new NodeHealthService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Node Registration (POST /api/nodes/register)', () => {
    test('Successfully registers a new node and stores persistent metadata in MySQL and live state in Redis', async () => {
      const record = await service.registerNode({
        nodeId: 'node-1',
        host: '192.168.1.10',
        port: 5001,
        totalCapacity: 100 * 1024 * 1024 * 1024,
        currentUsage: 2048,
      });

      // Verify MySQL persistent record
      expect(record.node_id).toBe('node-1');
      expect(record.host).toBe('192.168.1.10');
      expect(record.port).toBe(5001);
      expect(record.total_storage).toBe(100 * 1024 * 1024 * 1024);
      expect(record.used_storage).toBe(2048);
      expect(record.status).toBe('HEALTHY');

      // Verify Redis fast state
      const redisHealth = JSON.parse(mockRedis.get('node:health:node-1')!);
      expect(redisHealth.nodeId).toBe('node-1');
      expect(redisHealth.status).toBe('HEALTHY');
      expect(redisHealth.currentUsage).toBe(2048);
    });

    test('Prevents duplicate node registration by updating existing node record', async () => {
      // First registration
      const first = await service.registerNode({
        nodeId: 'node-1',
        host: '192.168.1.10',
        port: 5001,
        totalCapacity: 50000,
        currentUsage: 1000,
      });

      // Second registration with updated host and usage
      const second = await service.registerNode({
        nodeId: 'node-1',
        host: '192.168.1.20',
        port: 5001,
        totalCapacity: 60000,
        currentUsage: 2500,
      });

      // Same internal primary key id (no duplicate row)
      expect(second.id).toBe(first.id);
      expect(second.host).toBe('192.168.1.20');
      expect(second.total_storage).toBe(60000);
      expect(second.used_storage).toBe(2500);
      expect(mockDatabase.size).toBe(1);
    });

    test('Rejects invalid registration payloads missing required fields', async () => {
      await expect(
        service.registerNode({ nodeId: '', host: 'localhost', port: 5001 })
      ).rejects.toThrow(/nodeId is required/);

      await expect(
        service.registerNode({ nodeId: 'node-1', host: '', port: 5001 })
      ).rejects.toThrow(/host is required/);

      await expect(
        service.registerNode({ nodeId: 'node-1', host: 'localhost', port: -1 })
      ).rejects.toThrow(/valid port number/);
    });
  });

  describe('2. Periodic Heartbeat (POST /api/nodes/heartbeat)', () => {
    beforeEach(async () => {
      await service.registerNode({
        nodeId: 'node-1',
        host: 'localhost',
        port: 5001,
        totalCapacity: 100000,
        currentUsage: 500,
      });
    });

    test('Updates last heartbeat timestamp, usage, and HEALTHY status', async () => {
      const result = await service.recordHeartbeat({
        nodeId: 'node-1',
        currentUsage: 1500,
        status: 'HEALTHY',
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('node-1');
      expect(result.status).toBe('HEALTHY');

      // Verify MySQL updated
      const node = mockDatabase.get('node-1');
      expect(node?.used_storage).toBe(1500);
      expect(node?.status).toBe('HEALTHY');

      // Verify Redis updated
      const redisHealth = JSON.parse(mockRedis.get('node:health:node-1')!);
      expect(redisHealth.currentUsage).toBe(1500);
      expect(redisHealth.status).toBe('HEALTHY');
    });

    test('Throws 404 error if heartbeat received from unregistered node', async () => {
      await expect(
        service.recordHeartbeat({ nodeId: 'unregistered-node-99' })
      ).rejects.toThrow(/not registered/);
    });
  });

  describe('3. Node Status Transitions & Fast Redis vs MySQL Truth', () => {
    test('Explicit status update changes both Redis fast state and MySQL persistent state', async () => {
      await service.registerNode({
        nodeId: 'node-2',
        host: 'localhost',
        port: 5002,
        totalCapacity: 50000,
        currentUsage: 0,
      });

      // Mark UNAVAILABLE (e.g. graceful shutdown)
      await service.setNodeStatus('node-2', 'UNAVAILABLE');
      expect(mockDatabase.get('node-2')?.status).toBe('UNAVAILABLE');

      const nodeInfo = await service.getNode('node-2');
      expect(nodeInfo?.status).toBe('UNAVAILABLE');
      expect(nodeInfo?.sourceOfTruth).toBe('mysql');
      expect(nodeInfo?.liveState).toBe('redis');

      // Mark FAILED
      await service.setNodeStatus('node-2', 'FAILED');
      expect(mockDatabase.get('node-2')?.status).toBe('FAILED');
    });

    test('Detects stale/expired heartbeats and reports UNAVAILABLE status', async () => {
      await service.registerNode({
        nodeId: 'node-stale',
        host: 'localhost',
        port: 5003,
        totalCapacity: 10000,
        currentUsage: 0,
      });

      // Artificially simulate last heartbeat 30 seconds ago (timeout is 15s)
      const staleTimestamp = new Date(Date.now() - 30000).toISOString();
      mockRedis.set(
        'node:health:node-stale',
        JSON.stringify({
          nodeId: 'node-stale',
          status: 'HEALTHY',
          lastHeartbeat: staleTimestamp,
        })
      );

      const nodeInfo = await service.getNode('node-stale');
      expect(nodeInfo?.status).toBe('UNAVAILABLE');
    });
  });

  describe('4. Node Retrieval & Cluster State Endpoints', () => {
    beforeEach(async () => {
      await service.registerNode({
        nodeId: 'node-1',
        host: 'host-1',
        port: 5001,
        totalCapacity: 1000,
        currentUsage: 200,
      });
      await service.registerNode({
        nodeId: 'node-2',
        host: 'host-2',
        port: 5002,
        totalCapacity: 2000,
        currentUsage: 300,
      });
      await service.registerNode({
        nodeId: 'node-3',
        host: 'host-3',
        port: 5003,
        totalCapacity: 3000,
        currentUsage: 500,
      });
    });

    test('GET /api/nodes returns all registered nodes with live status', async () => {
      const nodes = await service.getAllNodes();
      expect(nodes.length).toBe(3);
      expect(nodes.map((n) => n.nodeId)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(nodes[0].status).toBe('HEALTHY');
    });

    test('GET /api/nodes/:id retrieves node by nodeId string or numeric id', async () => {
      const byString = await service.getNode('node-2');
      expect(byString).not.toBeNull();
      expect(byString?.nodeId).toBe('node-2');
      expect(byString?.totalCapacity).toBe(2000);

      const byId = await service.getNode(1);
      expect(byId).not.toBeNull();
      expect(byId?.nodeId).toBe('node-1');

      const notFound = await service.getNode('node-999');
      expect(notFound).toBeNull();
    });

    test('GET /api/nodes/cluster/state computes cluster-wide aggregates and status', async () => {
      const clusterState = await service.getClusterState();

      expect(clusterState.cluster.totalNodes).toBe(3);
      expect(clusterState.cluster.healthyNodes).toBe(3);
      expect(clusterState.cluster.unavailableNodes).toBe(0);
      expect(clusterState.cluster.failedNodes).toBe(0);
      expect(clusterState.cluster.totalCapacity).toBe(6000);
      expect(clusterState.cluster.currentUsage).toBe(1000);
      expect(clusterState.cluster.availableCapacity).toBe(5000);
      expect(clusterState.cluster.status).toBe('HEALTHY');

      // Now simulate one node shutting down -> DEGRADED
      await service.setNodeStatus('node-3', 'UNAVAILABLE');
      const degradedState = await service.getClusterState();
      expect(degradedState.cluster.healthyNodes).toBe(2);
      expect(degradedState.cluster.unavailableNodes).toBe(1);
      expect(degradedState.cluster.status).toBe('DEGRADED');

      // Simulate second node failing -> CRITICAL (healthyNodes = 1 < replicationFactor = 2)
      await service.setNodeStatus('node-2', 'FAILED');
      const criticalState = await service.getClusterState();
      expect(criticalState.cluster.healthyNodes).toBe(1);
      expect(criticalState.cluster.failedNodes).toBe(1);
      expect(criticalState.cluster.status).toBe('CRITICAL');
    });
  });
});
