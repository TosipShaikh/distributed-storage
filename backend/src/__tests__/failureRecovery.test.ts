import crypto from 'crypto';
import { RecoveryCoordinator } from '../services/recoveryCoordinator';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { chunkRepository } from '../repositories/chunkRepository';
import { chunkReplicaRepository } from '../repositories/chunkReplicaRepository';
import { recoveryEventRepository } from '../repositories/recoveryEventRepository';
import { storageCoordinator } from '../services/storageCoordinator';
import { StorageNodeRecord, Chunk, ChunkReplica, RecoveryEvent } from '../types';
import redis from '../config/redis';

describe('Step 9: Node Failure Detection and Replica Recovery', () => {
  let recoveryCoordinator: RecoveryCoordinator;

  // In-memory state for mocking repositories
  let nodesDb: Map<number, StorageNodeRecord>;
  let chunksDb: Map<number, Chunk>;
  let replicasDb: Map<number, ChunkReplica>;
  let recoveryEventsDb: Map<number, RecoveryEvent>;
  let chunkContentsMap: Map<number, Buffer>;
  let replicaIdCounter: number;
  let eventIdCounter: number;

  const testContent = Buffer.from('Reliable Distributed Chunk Binary Data');
  const testHash = crypto.createHash('sha256').update(testContent).digest('hex');

  beforeEach(() => {
    recoveryCoordinator = new RecoveryCoordinator();
    nodesDb = new Map();
    chunksDb = new Map();
    replicasDb = new Map();
    recoveryEventsDb = new Map();
    chunkContentsMap = new Map();
    chunkContentsMap.set(101, Buffer.from(testContent));
    replicaIdCounter = 1;
    eventIdCounter = 1;

    // Default 4 storage nodes
    const now = new Date();
    nodesDb.set(1, { id: 1, node_id: 'node-1', host: 'localhost', port: 5001, total_storage: 100000, used_storage: 1000, status: 'HEALTHY', last_heartbeat: now, created_at: now });
    nodesDb.set(2, { id: 2, node_id: 'node-2', host: 'localhost', port: 5002, total_storage: 100000, used_storage: 1000, status: 'HEALTHY', last_heartbeat: now, created_at: now });
    nodesDb.set(3, { id: 3, node_id: 'node-3', host: 'localhost', port: 5003, total_storage: 100000, used_storage: 1000, status: 'HEALTHY', last_heartbeat: now, created_at: now });
    nodesDb.set(4, { id: 4, node_id: 'node-4', host: 'localhost', port: 5004, total_storage: 100000, used_storage: 1000, status: 'HEALTHY', last_heartbeat: now, created_at: now });

    // Chunk 1
    chunksDb.set(101, {
      id: 101,
      chunk_id: 'chunk-alpha-uuid',
      file_id: 1,
      sequence_number: 1,
      size: testContent.length,
      hash: testHash,
      created_at: now,
    });

    // Chunk 1 placed on node 1 and node 2 (C1 -> N1, N2)
    replicasDb.set(1, { id: 1, chunk_id: 101, node_id: 1, status: 'active', created_at: now });
    replicasDb.set(2, { id: 2, chunk_id: 101, node_id: 2, status: 'active', created_at: now });
    replicaIdCounter = 3;

    // Mock storageNodeRepository
    jest.spyOn(storageNodeRepository, 'findAll').mockImplementation(async () => Array.from(nodesDb.values()));
    jest.spyOn(storageNodeRepository, 'findById').mockImplementation(async (id: number) => nodesDb.get(id) || null);
    jest.spyOn(storageNodeRepository, 'findByNodeId').mockImplementation(async (nodeId: string) => {
      for (const node of nodesDb.values()) {
        if (node.node_id === nodeId) return node;
      }
      return null;
    });
    jest.spyOn(storageNodeRepository, 'findAllHealthy').mockImplementation(async () => {
      return Array.from(nodesDb.values()).filter((n) => n.status === 'HEALTHY' || n.status === 'online');
    });
    jest.spyOn(storageNodeRepository, 'updateStatus').mockImplementation(async (nodeId: string, status: any) => {
      for (const node of nodesDb.values()) {
        if (node.node_id === nodeId) {
          node.status = status;
          break;
        }
      }
    });
    jest.spyOn(storageNodeRepository, 'updateHeartbeat').mockImplementation(async (nodeId: string, usedStorage?: number) => {
      for (const node of nodesDb.values()) {
        if (node.node_id === nodeId) {
          if (usedStorage !== undefined) node.used_storage = usedStorage;
          break;
        }
      }
    });

    // Mock chunkRepository
    jest.spyOn(chunkRepository, 'findById').mockImplementation(async (id: number) => chunksDb.get(id) || null);

    // Mock chunkReplicaRepository
    jest.spyOn(chunkReplicaRepository, 'findByChunkId').mockImplementation(async (chunkId: number) => {
      return Array.from(replicasDb.values()).filter((r) => r.chunk_id === chunkId);
    });
    jest.spyOn(chunkReplicaRepository, 'findByNodeId').mockImplementation(async (nodeId: number) => {
      return Array.from(replicasDb.values()).filter((r) => r.node_id === nodeId);
    });
    jest.spyOn(chunkReplicaRepository, 'updateStatus').mockImplementation(async (id: number, status: any) => {
      const rep = replicasDb.get(id);
      if (rep) rep.status = status;
    });
    jest.spyOn(chunkReplicaRepository, 'create').mockImplementation(async (chunkId: number, nodeId: number, status: any) => {
      const rep: ChunkReplica = {
        id: replicaIdCounter++,
        chunk_id: chunkId,
        node_id: nodeId,
        status: status || 'active',
        created_at: new Date(),
      };
      replicasDb.set(rep.id, rep);
      return rep;
    });

    // Mock recoveryEventRepository
    jest.spyOn(recoveryEventRepository, 'create').mockImplementation(async (nodeId: number | null, chunkId: number | null, eventType: any, status: any) => {
      const event: RecoveryEvent = {
        id: eventIdCounter++,
        node_id: nodeId,
        chunk_id: chunkId,
        event_type: eventType,
        status: status || 'pending',
        created_at: new Date(),
      };
      recoveryEventsDb.set(event.id, event);
      return event;
    });
    jest.spyOn(recoveryEventRepository, 'updateStatus').mockImplementation(async (id: number, status: any) => {
      const ev = recoveryEventsDb.get(id);
      if (ev) ev.status = status;
    });
    jest.spyOn(recoveryEventRepository, 'getStats').mockImplementation(async () => {
      return {
        total: recoveryEventsDb.size,
        pending: 0,
        in_progress: 0,
        completed: Array.from(recoveryEventsDb.values()).filter((e) => e.status === 'completed').length,
        failed: Array.from(recoveryEventsDb.values()).filter((e) => e.status === 'failed').length,
      };
    });

    // Mock storageCoordinator download and upload methods
    jest.spyOn(storageCoordinator, 'downloadChunkWithFallback').mockImplementation(async (chunk: any) => {
      const buf = chunkContentsMap.get(chunk.id);
      return buf || Buffer.from(testContent);
    });
    jest.spyOn(storageCoordinator, 'uploadChunkToNode').mockImplementation(async () => {
      return { success: true, message: 'Stored' };
    });
  });

  afterEach(() => {
    recoveryCoordinator.stop();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      redis.disconnect();
    } catch {}
  });

  describe('1. Single Node Failure & Replica Recovery', () => {
    test('Detects node failure and restores replication factor on healthy replacement node (C1 -> N1, N3)', async () => {
      // Simulate Node 2 failure: heartbeat 30 seconds ago (timeout is 15s)
      const staleTime = new Date(Date.now() - 30000);
      const node2 = nodesDb.get(2)!;
      node2.last_heartbeat = staleTime;

      // Run failure detection & recovery cycle
      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(result.recoveredNodes).toBe(1);
      expect(result.recoveredChunks).toBe(1);
      expect(node2.status).toBe('FAILED');

      // Verify replicas for Chunk 101
      const activeReplicas = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      );

      // Must have exactly REPLICATION_FACTOR (2) active replicas
      expect(activeReplicas.length).toBe(2);

      const replicaNodeIds = activeReplicas.map((r) => r.node_id);
      expect(replicaNodeIds).toContain(1); // Surviving node 1
      expect(replicaNodeIds).not.toContain(2); // Failed node 2 must NOT be active
      expect(replicaNodeIds).toContain(3); // Replaced on healthy node 3

      // Verify recovery event was recorded in recovery_events
      const events = Array.from(recoveryEventsDb.values());
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some((e) => e.status === 'completed')).toBe(true);
    });
  });

  describe('2. Multiple Affected Chunks', () => {
    test('Recovers all affected chunks when a node hosting multiple chunks fails', async () => {
      // Add Chunk 102 (C2) also hosted on node 2 and node 3
      const chunk2Content = Buffer.from('Chunk Two Data Content');
      chunkContentsMap.set(102, chunk2Content);
      chunksDb.set(102, {
        id: 102,
        chunk_id: 'chunk-beta-uuid',
        file_id: 1,
        sequence_number: 2,
        size: chunk2Content.length,
        hash: crypto.createHash('sha256').update(chunk2Content).digest('hex'),
        created_at: new Date(),
      });
      replicasDb.set(3, { id: 3, chunk_id: 102, node_id: 2, status: 'active', created_at: new Date() });
      replicasDb.set(4, { id: 4, chunk_id: 102, node_id: 3, status: 'active', created_at: new Date() });
      replicaIdCounter = 5;

      // Node 2 fails
      nodesDb.get(2)!.status = 'FAILED';

      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(result.recoveredChunks).toBe(2);

      // Chunk 101 active replicas: N1 and replacement (N3 or N4)
      const c1Replicas = Array.from(replicasDb.values()).filter((r) => r.chunk_id === 101 && r.status === 'active');
      expect(c1Replicas.length).toBe(2);
      expect(c1Replicas.map((r) => r.node_id)).not.toContain(2);

      // Chunk 102 active replicas: N3 and replacement (N1 or N4)
      const c2Replicas = Array.from(replicasDb.values()).filter((r) => r.chunk_id === 102 && r.status === 'active');
      expect(c2Replicas.length).toBe(2);
      expect(c2Replicas.map((r) => r.node_id)).not.toContain(2);
    });
  });

  describe('3. Retry Logic & Temporary Node Failure', () => {
    test('Retries upload when candidate node has temporary failure and succeeds on retry', async () => {
      nodesDb.get(2)!.status = 'FAILED';

      let uploadAttempts = 0;
      jest.spyOn(storageCoordinator, 'uploadChunkToNode').mockImplementation(async () => {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          throw new Error('Temporary connection reset (ECONNRESET)');
        }
        return { success: true, message: 'Stored on retry' };
      });

      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(uploadAttempts).toBe(2);
      expect(result.recoveredChunks).toBe(1);
    });
  });

  describe('4. Failed Replacement Node & Failover', () => {
    test('Fails over to alternative healthy candidate node if first candidate fails all retries', async () => {
      nodesDb.get(2)!.status = 'FAILED';

      // Candidate Node 3 fails permanently, but Node 4 succeeds
      jest.spyOn(storageCoordinator, 'uploadChunkToNode').mockImplementation(async (node) => {
        if (node.node_id === 'node-3') {
          throw new Error('Disk full on node-3');
        }
        return { success: true, message: 'Stored' };
      });

      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(result.recoveredChunks).toBe(1);

      // Active replicas should be N1 and N4
      const activeReplicas = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      );
      expect(activeReplicas.map((r) => r.node_id)).toContain(4);
    });
  });

  describe('5. Insufficient Healthy Nodes', () => {
    test('Cleanly reports insufficient healthy nodes without corrupting metadata when no replacement nodes exist', async () => {
      // Mark nodes 2, 3, and 4 all offline/failed
      nodesDb.get(2)!.status = 'FAILED';
      nodesDb.get(3)!.status = 'offline';
      nodesDb.get(4)!.status = 'offline';

      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(result.recoveredChunks).toBe(0);
      expect(result.failedChunks).toBe(1);

      // Node 1 replica remains intact and active
      const activeReplicas = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      );
      expect(activeReplicas.length).toBe(1);
      expect(activeReplicas[0].node_id).toBe(1);
    });
  });

  describe('6. Idempotency & Duplicate Recovery Attempt', () => {
    test('Running recovery twice does NOT create duplicate replicas or exceed REPLICATION_FACTOR', async () => {
      nodesDb.get(2)!.status = 'FAILED';

      // First recovery cycle
      const firstResult = await recoveryCoordinator.checkAndRecoverNodes();
      expect(firstResult.recoveredChunks).toBe(1);

      const initialReplicasCount = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      ).length;
      expect(initialReplicasCount).toBe(2);

      // Second duplicate recovery cycle
      const secondResult = await recoveryCoordinator.checkAndRecoverNodes();
      expect(secondResult.recoveredChunks).toBe(0);

      const finalReplicasCount = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      ).length;

      // Must remain exactly 2 replicas (no duplicates created!)
      expect(finalReplicasCount).toBe(2);
    });
  });

  describe('7. SHA-256 Integrity Verification', () => {
    test('Rejects corrupted chunk and does NOT replicate if hash integrity check fails', async () => {
      nodesDb.get(2)!.status = 'FAILED';

      // Surviving replica on node 1 returns corrupted binary
      jest.spyOn(storageCoordinator, 'downloadChunkWithFallback').mockImplementation(async () => {
        return Buffer.from('CORRUPTED MALICIOUS TAMPERED DATA');
      });

      const result = await recoveryCoordinator.checkAndRecoverNodes();

      expect(result.recoveredChunks).toBe(0);
      expect(result.failedChunks).toBe(1);

      // No new replica was recorded
      const activeReplicas = Array.from(replicasDb.values()).filter(
        (r) => r.chunk_id === 101 && r.status === 'active'
      );
      expect(activeReplicas.length).toBe(1); // only the surviving one, no corrupted copy spawned
    });
  });
});
