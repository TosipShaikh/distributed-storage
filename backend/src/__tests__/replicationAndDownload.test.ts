import crypto from 'crypto';
import { StorageCoordinator } from '../services/storageCoordinator';
import { StorageNodeRecord, Chunk } from '../types';

describe('Step 7: Replication and File Download Subsystem', () => {
  let coordinator: StorageCoordinator;

  beforeAll(() => {
    coordinator = new StorageCoordinator();
  });

  const mockNodes: StorageNodeRecord[] = [
    { id: 1, node_id: 'storage-node-1', host: 'localhost', port: 5001, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 2, node_id: 'storage-node-2', host: 'localhost', port: 5002, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 3, node_id: 'storage-node-3', host: 'localhost', port: 5003, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
    { id: 4, node_id: 'storage-node-4', host: 'localhost', port: 5004, total_storage: 100000, used_storage: 0, status: 'online', last_heartbeat: new Date(), created_at: new Date() },
  ];

  const nodeMap = new Map<number, StorageNodeRecord>(mockNodes.map((n) => [n.id, n]));

  describe('1. Replication Placement Rules (C1 -> N1 + N3, C2 -> N2 + N4)', () => {
    test('Places 2 distinct replicas per chunk: C1 -> N1 + N3 and C2 -> N2 + N4', () => {
      const c1Nodes = coordinator.selectNodesForChunk(1, mockNodes, 2);
      const c2Nodes = coordinator.selectNodesForChunk(2, mockNodes, 2);

      expect(c1Nodes).toHaveLength(2);
      expect(c1Nodes[0].node_id).toBe('storage-node-1');
      expect(c1Nodes[1].node_id).toBe('storage-node-3');

      expect(c2Nodes).toHaveLength(2);
      expect(c2Nodes[0].node_id).toBe('storage-node-2');
      expect(c2Nodes[1].node_id).toBe('storage-node-4');

      // Never place duplicate replicas on the same node
      const c1Ids = new Set(c1Nodes.map((n) => n.id));
      expect(c1Ids.size).toBe(2);
    });

    test('Throws error if available healthy nodes < replication factor', () => {
      const singleNode = [mockNodes[0]];
      expect(() => coordinator.selectNodesForChunk(1, singleNode, 2)).toThrow(
        'Insufficient healthy storage nodes'
      );
    });
  });

  describe('2. Successful Download & Reconstruction', () => {
    test('Downloads chunk from healthy replica and verifies SHA-256', async () => {
      const originalText = 'Hello Distributed File Storage Replica!';
      const originalBuffer = Buffer.from(originalText, 'utf-8');
      const expectedHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

      const chunk: Chunk = {
        id: 101,
        chunk_id: 'chunk-success-uuid',
        file_id: 1,
        sequence_number: 1,
        size: originalBuffer.length,
        hash: expectedHash,
        created_at: new Date(),
      };

      const replicas = [
        { chunk_id: 101, node_id: 1, status: 'active' },
        { chunk_id: 101, node_id: 3, status: 'active' },
      ];

      // Mock fetchChunkFromNode to return valid buffer from node 1
      jest.spyOn(coordinator, 'fetchChunkFromNode').mockResolvedValue(originalBuffer);

      const downloadedBuffer = await coordinator.downloadChunkWithFallback(chunk, replicas, nodeMap);

      expect(downloadedBuffer).toEqual(originalBuffer);
      expect(downloadedBuffer.toString()).toBe(originalText);
    });
  });

  describe('3. Automatic Failover: One Unavailable Replica', () => {
    test('Automatically fails over to second replica when first replica fails with network error', async () => {
      const originalText = 'Failover content from secondary replica';
      const originalBuffer = Buffer.from(originalText, 'utf-8');
      const expectedHash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

      const chunk: Chunk = {
        id: 102,
        chunk_id: 'chunk-failover-uuid',
        file_id: 1,
        sequence_number: 1,
        size: originalBuffer.length,
        hash: expectedHash,
        created_at: new Date(),
      };

      const replicas = [
        { chunk_id: 102, node_id: 1, status: 'active' }, // Primary on Node 1 (will fail)
        { chunk_id: 102, node_id: 3, status: 'active' }, // Secondary on Node 3 (will succeed)
      ];

      // Silence expected warning log
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock fetchChunkFromNode: fail on Node 1, succeed on Node 3
      jest.spyOn(coordinator, 'fetchChunkFromNode').mockImplementation(async (node) => {
        if (node.id === 1) {
          throw new Error('ECONNREFUSED: Connection refused to storage-node-1');
        }
        return originalBuffer;
      });

      const downloadedBuffer = await coordinator.downloadChunkWithFallback(chunk, replicas, nodeMap);

      expect(downloadedBuffer).toEqual(originalBuffer);
      expect(downloadedBuffer.toString()).toBe(originalText);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('4. Automatic Failover: Corrupted Replica (Hash Mismatch)', () => {
    test('Rejects corrupted replica with wrong SHA-256 and retrieves healthy copy from alternative replica', async () => {
      const validContent = 'Genuine uncorrupted chunk data';
      const validBuffer = Buffer.from(validContent, 'utf-8');
      const validHash = crypto.createHash('sha256').update(validBuffer).digest('hex');

      const corruptedBuffer = Buffer.from('Tampered corrupted data content!', 'utf-8');

      const chunk: Chunk = {
        id: 103,
        chunk_id: 'chunk-corrupt-uuid',
        file_id: 1,
        sequence_number: 1,
        size: validBuffer.length,
        hash: validHash,
        created_at: new Date(),
      };

      const replicas = [
        { chunk_id: 103, node_id: 2, status: 'active' }, // Node 2 has corrupted binary
        { chunk_id: 103, node_id: 4, status: 'active' }, // Node 4 has healthy binary
      ];

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock fetchChunkFromNode: Node 2 returns corrupted bytes, Node 4 returns genuine bytes
      jest.spyOn(coordinator, 'fetchChunkFromNode').mockImplementation(async (node) => {
        if (node.id === 2) {
          return corruptedBuffer;
        }
        return validBuffer;
      });

      const resultBuffer = await coordinator.downloadChunkWithFallback(chunk, replicas, nodeMap);

      expect(resultBuffer).toEqual(validBuffer);
      expect(resultBuffer.toString()).toBe(validContent);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Integrity violation on node \'storage-node-2\'')
      );

      warnSpy.mockRestore();
    });
  });

  describe('5. Missing Chunk / All Replicas Failed', () => {
    test('Throws error when all replicas for a chunk fail', async () => {
      const chunk: Chunk = {
        id: 104,
        chunk_id: 'chunk-all-failed-uuid',
        file_id: 1,
        sequence_number: 1,
        size: 100,
        hash: 'somehash',
        created_at: new Date(),
      };

      const replicas = [
        { chunk_id: 104, node_id: 1, status: 'active' },
        { chunk_id: 104, node_id: 3, status: 'active' },
      ];

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Both nodes fail
      jest.spyOn(coordinator, 'fetchChunkFromNode').mockRejectedValue(new Error('Node unreachable'));

      await expect(
        coordinator.downloadChunkWithFallback(chunk, replicas, nodeMap)
      ).rejects.toThrow('All replicas failed for chunk 1');

      warnSpy.mockRestore();
    });

    test('Throws error when chunk has no recorded active replicas', async () => {
      const chunk: Chunk = {
        id: 105,
        chunk_id: 'chunk-no-replicas-uuid',
        file_id: 1,
        sequence_number: 1,
        size: 100,
        hash: 'somehash',
        created_at: new Date(),
      };

      await expect(
        coordinator.downloadChunkWithFallback(chunk, [], nodeMap)
      ).rejects.toThrow('No active replicas recorded');
    });
  });
});
