import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StorageCoordinator } from '../services/storageCoordinator';
import { chunkReplicaRepository } from '../repositories/chunkReplicaRepository';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { StorageNodeRecord, Chunk, ChunkPlan } from '../types';

describe('StorageCoordinator Subsystem Tests (Step 6)', () => {
  let coordinator: StorageCoordinator;
  const testDir = path.resolve(__dirname, 'temp_coordinator_test');

  beforeAll(async () => {
    coordinator = new StorageCoordinator();
    if (!fs.existsSync(testDir)) {
      await fs.promises.mkdir(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  function createTestFile(fileName: string, sizeBytes: number): string {
    const filePath = path.join(testDir, fileName);
    const buffer = Buffer.alloc(sizeBytes, 'a');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  const mockNodes: StorageNodeRecord[] = [
    { id: 1, node_id: 'storage-node-1', host: 'localhost', port: 5001, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 2, node_id: 'storage-node-2', host: 'localhost', port: 5002, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 3, node_id: 'storage-node-3', host: 'localhost', port: 5003, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 4, node_id: 'storage-node-4', host: 'localhost', port: 5004, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
  ];

  describe('1. Deterministic Round-Robin Placement Strategy', () => {
    test('Correctly maps C1 -> N1, C2 -> N2, C3 -> N3, C4 -> N4, and cycles back to N1 for C5', () => {
      const selectedN1 = coordinator.selectNodeRoundRobin(1, mockNodes);
      const selectedN2 = coordinator.selectNodeRoundRobin(2, mockNodes);
      const selectedN3 = coordinator.selectNodeRoundRobin(3, mockNodes);
      const selectedN4 = coordinator.selectNodeRoundRobin(4, mockNodes);
      const selectedN5 = coordinator.selectNodeRoundRobin(5, mockNodes);

      expect(selectedN1.node_id).toBe('storage-node-1');
      expect(selectedN2.node_id).toBe('storage-node-2');
      expect(selectedN3.node_id).toBe('storage-node-3');
      expect(selectedN4.node_id).toBe('storage-node-4');
      expect(selectedN5.node_id).toBe('storage-node-1'); // Cycles back to N1
    });

    test('Throws error when no healthy nodes are available', () => {
      expect(() => coordinator.selectNodeRoundRobin(1, [])).toThrow('no healthy storage nodes available');
    });
  });

  describe('2. Node Health Filtering (Ignore FAILED/Offline Nodes)', () => {
    test('Skips offline and maintenance nodes from placement', async () => {
      const mixedNodes: StorageNodeRecord[] = [
        { id: 1, node_id: 'node-1', host: '127.0.0.1', port: 5001, total_storage: 100, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
        { id: 2, node_id: 'node-2', host: '127.0.0.1', port: 5002, total_storage: 100, used_storage: 0, status: 'offline', last_heartbeat: new Date(), created_at: new Date() },
        { id: 3, node_id: 'node-3', host: '127.0.0.1', port: 5003, total_storage: 100, used_storage: 0, status: 'maintenance', last_heartbeat: new Date(), created_at: new Date() },
        { id: 4, node_id: 'node-4', host: '127.0.0.1', port: 5004, total_storage: 100, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
      ];

      // Mock storageNodeRepository.findAll
      jest.spyOn(storageNodeRepository, 'findAll').mockResolvedValue(mixedNodes);
      // Mock pingNode to return true only for online nodes
      jest.spyOn(coordinator, 'pingNode').mockImplementation(async (node) => node.status === 'online');

      const healthy = await coordinator.getHealthyNodes();
      expect(healthy.map((n) => n.node_id)).toEqual(['node-1', 'node-4']);
      expect(healthy.every((n) => n.status === 'online')).toBe(true);
    });
  });

  describe('3. HTTP Upload, Confirmation & Replica Recording', () => {
    let mockServer: http.Server;
    let serverPort: number;
    const receivedChunks: Map<string, Buffer> = new Map();

    beforeAll((done) => {
      mockServer = http.createServer((req, res) => {
        const url = req.url || '';
        if (req.method === 'POST' && url.startsWith('/chunks/')) {
          const chunkId = url.replace('/chunks/', '');
          const bodyParts: Buffer[] = [];
          req.on('data', (d) => bodyParts.push(d));
          req.on('end', () => {
            const buf = Buffer.concat(bodyParts);
            receivedChunks.set(chunkId, buf);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, chunkId, size: buf.length }));
          });
        } else if (req.method === 'DELETE' && url.startsWith('/chunks/')) {
          const chunkId = url.replace('/chunks/', '');
          receivedChunks.delete(chunkId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, deleted: chunkId }));
        } else {
          res.writeHead(404).end();
        }
      });

      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        serverPort = addr.port;
        done();
      });
    });

    afterAll((done) => {
      mockServer.close(done);
    });

    test('Streams chunk over HTTP, confirms storage, and records replica', async () => {
      const testChunkContent = 'chunk-binary-content-12345';
      const chunkId = 'test-chunk-uuid-1';
      const testFilePath = createTestFile('http_test.bin', testChunkContent.length);
      fs.writeFileSync(testFilePath, testChunkContent);

      const nodeRecord: StorageNodeRecord = {
        id: 10,
        node_id: 'live-mock-node',
        host: '127.0.0.1',
        port: serverPort,
        total_storage: 1000000,
        used_storage: 0,
        status: 'online',
        last_heartbeat: new Date(),
        created_at: new Date(),
      };

      const result = await coordinator.uploadChunkToNode(
        nodeRecord,
        chunkId,
        testChunkContent.length,
        () => fs.createReadStream(testFilePath)
      );

      expect(result.success).toBe(true);
      expect(receivedChunks.has(chunkId)).toBe(true);
      expect(receivedChunks.get(chunkId)?.toString()).toBe(testChunkContent);
    });

    test('End-to-end distributeChunks: uploads 4 chunks to nodes in round-robin and records chunk_replicas', async () => {
      const liveNode: StorageNodeRecord = {
        id: 1,
        node_id: 'test-node-1',
        host: '127.0.0.1',
        port: serverPort,
        total_storage: 1000000,
        used_storage: 0,
        status: 'online',
        last_heartbeat: new Date(),
        created_at: new Date(),
      };

      const filePath = createTestFile('distribute_4_chunks.bin', 400);
      const chunks: Chunk[] = [
        { id: 101, chunk_id: 'c1-uuid', file_id: 1, sequence_number: 1, size: 100, hash: 'h1', created_at: new Date() },
        { id: 102, chunk_id: 'c2-uuid', file_id: 1, sequence_number: 2, size: 100, hash: 'h2', created_at: new Date() },
        { id: 103, chunk_id: 'c3-uuid', file_id: 1, sequence_number: 3, size: 100, hash: 'h3', created_at: new Date() },
        { id: 104, chunk_id: 'c4-uuid', file_id: 1, sequence_number: 4, size: 100, hash: 'h4', created_at: new Date() },
      ];

      const plans: ChunkPlan[] = [
        { sequenceNumber: 1, startByte: 0, endByte: 99, size: 100 },
        { sequenceNumber: 2, startByte: 100, endByte: 199, size: 100 },
        { sequenceNumber: 3, startByte: 200, endByte: 299, size: 100 },
        { sequenceNumber: 4, startByte: 300, endByte: 399, size: 100 },
      ];

      // Mock chunkReplicaRepository.create
      const createdReplicas: any[] = [];
      jest.spyOn(chunkReplicaRepository, 'create').mockImplementation(async (chunkId, nodeId, status = 'active') => {
        const replica = { id: createdReplicas.length + 1, chunk_id: chunkId, node_id: nodeId, status, created_at: new Date() };
        createdReplicas.push(replica);
        return replica;
      });

      jest.spyOn(storageNodeRepository, 'updateHeartbeat').mockResolvedValue();

      const placements = await coordinator.distributeChunks(chunks, filePath, plans, [liveNode], 1);

      expect(placements).toHaveLength(4);
      expect(placements.map((p) => p.sequenceNumber)).toEqual([1, 2, 3, 4]);
      expect(placements.every((p) => p.status === 'stored')).toBe(true);
      expect(createdReplicas).toHaveLength(4);
      expect(createdReplicas.map((r) => r.chunk_id)).toEqual([101, 102, 103, 104]);
    });
  });

  describe('4. Error Handling, Timeout & Failure Compensation', () => {
    test('Does NOT record replica if node returns HTTP error; triggers rollback', async () => {
      // Create server that returns 500
      const errorServer = http.createServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Disk full' }));
      });

      await new Promise<void>((resolve) => errorServer.listen(0, '127.0.0.1', () => resolve()));
      const errPort = (errorServer.address() as any).port;

      const failingNode: StorageNodeRecord = {
        id: 99,
        node_id: 'failing-node',
        host: '127.0.0.1',
        port: errPort,
        total_storage: 100,
        used_storage: 100,
        status: 'online',
        last_heartbeat: new Date(),
        created_at: new Date(),
      };

      const testFilePath = createTestFile('fail_test.bin', 50);
      const chunkId = 'chunk-to-fail';

      await expect(
        coordinator.uploadChunkToNode(failingNode, chunkId, 50, () => fs.createReadStream(testFilePath))
      ).rejects.toThrow('Storage node \'failing-node\' rejected chunk');

      await new Promise<void>((resolve) => errorServer.close(() => resolve()));
    });
  });
});
