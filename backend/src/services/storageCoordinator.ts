import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { chunkReplicaRepository } from '../repositories/chunkReplicaRepository';
import { Chunk, ChunkPlan, ChunkPlacement, StorageNodeRecord } from '../types';

export class StorageCoordinator {
  /**
   * Synchronize environment configured storage nodes into MySQL storage_nodes table.
   * Ensures nodes configured via STORAGE_NODES are present in the database registry.
   */
  async syncConfiguredNodes(): Promise<void> {
    if (!config.storageNodes || config.storageNodes.length === 0) {
      return;
    }

    for (let i = 0; i < config.storageNodes.length; i++) {
      const nodeUrl = config.storageNodes[i];
      try {
        const parsed = new URL(nodeUrl);
        const host = parsed.hostname;
        const port = parseInt(parsed.port, 10) || 80;
        const match = host.match(/node-(\d+)/);
        const nodeId = match ? `node-${match[1]}` : `node-${i + 1}`;

        const existing = await storageNodeRepository.findByNodeId(nodeId);
        if (!existing) {
          await storageNodeRepository.upsert(nodeId, host, port, 100 * 1024 * 1024 * 1024, 0, 'HEALTHY'); // 100 GB default
        }
      } catch (err) {
        console.warn(`[StorageCoordinator] Failed to sync node URL '${nodeUrl}':`, (err as Error).message);
      }
    }
  }

  /**
   * Ping a single storage node's /health endpoint with timeout.
   * Updates its status in MySQL to 'online' or 'offline'.
   */
  async pingNode(node: StorageNodeRecord): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: node.host,
          port: node.port,
          path: '/health',
          method: 'GET',
          timeout: config.storage.requestTimeout,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            const isOk = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
            resolve(isOk);
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Discover registered and active storage nodes.
   * Ignores nodes marked 'offline', 'failed', or unresponsive.
   */
  async getHealthyNodes(): Promise<StorageNodeRecord[]> {
    await this.syncConfiguredNodes();

    const registeredNodes = await storageNodeRepository.findAll();
    if (registeredNodes.length === 0) {
      return [];
    }

    const healthyNodes: StorageNodeRecord[] = [];

    for (const node of registeredNodes) {
      // Ignore nodes marked 'maintenance' or 'FAILED'
      if (node.status === 'maintenance' || node.status === 'FAILED') {
        continue;
      }

      // Live health probe with timeout
      const isAlive = await this.pingNode(node);
      if (isAlive) {
        if (node.status !== 'HEALTHY' && node.status !== 'online') {
          await storageNodeRepository.updateStatus(node.node_id, 'HEALTHY');
          node.status = 'HEALTHY';
        }
        healthyNodes.push(node);
      } else {
        if (node.status !== 'UNAVAILABLE' && node.status !== 'offline') {
          await storageNodeRepository.updateStatus(node.node_id, 'UNAVAILABLE');
          node.status = 'UNAVAILABLE';
        }
      }
    }

    return healthyNodes;
  }

  /**
   * Select a storage node for a chunk using simple deterministic round-robin placement.
   */
  selectNodeRoundRobin(sequenceNumber: number, nodes: StorageNodeRecord[]): StorageNodeRecord {
    if (!nodes || nodes.length === 0) {
      throw new Error('Cannot select storage node: no healthy storage nodes available.');
    }
    const index = (sequenceNumber - 1) % nodes.length;
    return nodes[index];
  }

  /**
   * Select R distinct healthy storage nodes for a chunk to satisfy the replication factor.
   * Never places duplicate replicas on the same node.
   *
   * Example (4 nodes: N1, N2, N3, N4, R=2):
   * C1 (seq 1) -> N1 + N3
   * C2 (seq 2) -> N2 + N4
   * C3 (seq 3) -> N3 + N1
   * C4 (seq 4) -> N4 + N2
   */
  selectNodesForChunk(
    sequenceNumber: number,
    nodes: StorageNodeRecord[],
    replicationFactor: number = config.storage.replicationFactor || 2
  ): StorageNodeRecord[] {
    if (!nodes || nodes.length < replicationFactor) {
      throw new Error(
        `Cannot place replicas: Insufficient healthy storage nodes (available: ${nodes?.length || 0}, required: ${replicationFactor}).`
      );
    }

    const selected: StorageNodeRecord[] = [];
    const primaryIndex = (sequenceNumber - 1) % nodes.length;

    // Stride offset to disperse replicas evenly across nodes
    // When 4 nodes and R=2: offset=2 -> C1 gets N1+N3, C2 gets N2+N4
    const offset = nodes.length >= 4 && replicationFactor === 2 ? Math.floor(nodes.length / 2) : 1;

    for (let r = 0; r < replicationFactor; r++) {
      const targetIndex = (primaryIndex + r * offset) % nodes.length;
      const candidate = nodes[targetIndex];
      if (!selected.some((s) => s.id === candidate.id)) {
        selected.push(candidate);
      } else {
        // Find next available distinct node
        for (let i = 0; i < nodes.length; i++) {
          const fallback = nodes[(primaryIndex + i) % nodes.length];
          if (!selected.some((s) => s.id === fallback.id)) {
            selected.push(fallback);
            break;
          }
        }
      }
    }

    return selected;
  }

  /**
   * Send a binary chunk slice directly to a storage node via HTTP streaming.
   * Does NOT buffer the chunk in memory. Sets Content-Length and enforces timeout.
   */
  async uploadChunkToNode(
    node: StorageNodeRecord,
    chunkId: string,
    size: number,
    createStream: () => NodeJS.ReadableStream
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: node.host,
          port: node.port,
          path: `/chunks/${chunkId}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': size,
          },
          timeout: config.storage.requestTimeout,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, message: body });
            } else {
              reject(
                new Error(
                  `Storage node '${node.node_id}' rejected chunk '${chunkId}' with HTTP ${res.statusCode}: ${body}`
                )
              );
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(
          new Error(
            `Upload request to node '${node.node_id}' for chunk '${chunkId}' timed out after ${config.storage.requestTimeout}ms`
          )
        );
      });

      req.on('error', (err) => {
        reject(new Error(`Failed to transmit chunk '${chunkId}' to node '${node.node_id}': ${err.message}`));
      });

      const stream = createStream();
      stream.pipe(req);
      stream.on('error', (err) => req.destroy(err));
    });
  }

  /**
   * Fetch a chunk binary from a storage node via HTTP GET.
   * Enforces configurable timeout and streams the response buffer.
   */
  async fetchChunkFromNode(node: StorageNodeRecord, chunkId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: node.host,
          port: node.port,
          path: `/chunks/${chunkId}`,
          method: 'GET',
          timeout: config.storage.requestTimeout,
        },
        (res) => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            res.resume();
            return reject(new Error(`Storage node '${node.node_id}' returned HTTP ${res.statusCode}`));
          }

          const parts: Buffer[] = [];
          res.on('data', (d) => parts.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
          res.on('end', () => resolve(Buffer.concat(parts)));
          res.on('error', (err) => reject(err));
        }
      );

      req.on('timeout', () => {
        req.destroy(
          new Error(`Download request to node '${node.node_id}' for chunk '${chunkId}' timed out after ${config.storage.requestTimeout}ms`)
        );
      });

      req.on('error', (err) => reject(err));
      req.end();
    });
  }

  /**
   * Download a chunk with automatic replica failover and SHA-256 integrity verification:
   * 1. Iterates through the chunk's active replicas.
   * 2. Skips offline nodes.
   * 3. Fetches chunk binary.
   * 4. Verifies SHA-256 digest against chunk.hash.
   * 5. If node fails, times out, or hash is corrupted, automatically tries the next replica!
   * 6. Throws error only if all replicas fail.
   */
  async downloadChunkWithFallback(
    chunk: Chunk,
    replicas: { id?: number; chunk_id: number; node_id: number; status: string }[],
    allNodes: Map<number, StorageNodeRecord>
  ): Promise<Buffer> {
    if (!replicas || replicas.length === 0) {
      throw new Error(`No active replicas recorded for chunk sequence ${chunk.sequence_number} (${chunk.chunk_id})`);
    }

    const errors: string[] = [];

    for (const replica of replicas) {
      const node = allNodes.get(replica.node_id);
      if (!node) {
        errors.push(`Node ID ${replica.node_id} not found in registry`);
        continue;
      }
      if (node.status === 'offline' || node.status === 'maintenance') {
        errors.push(`Node '${node.node_id}' is currently ${node.status}`);
        continue;
      }

      try {
        // 1. Fetch chunk binary from node
        const buffer = await this.fetchChunkFromNode(node, chunk.chunk_id);

        // 2. Verify SHA-256 hash integrity
        const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');
        if (computedHash !== chunk.hash) {
          throw new Error(
            `Integrity violation on node '${node.node_id}': SHA-256 mismatch (expected: ${chunk.hash}, got: ${computedHash})`
          );
        }

        // Successfully verified!
        return buffer;
      } catch (replicaError) {
        console.warn(
          `[StorageCoordinator] Replica on node '${node.node_id}' failed for chunk ${chunk.sequence_number}: ${(replicaError as Error).message}. Attempting fallback replica...`
        );
        errors.push(`${node.node_id}: ${(replicaError as Error).message}`);
      }
    }

    throw new Error(
      `All replicas failed for chunk ${chunk.sequence_number} (${chunk.chunk_id}): ${errors.join('; ')}`
    );
  }

  /**
   * Delete a stored chunk from a storage node (used for rollback/cleanup on upload failure).
   */
  async deleteChunkFromNode(node: StorageNodeRecord, chunkId: string): Promise<void> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: node.host,
          port: node.port,
          path: `/chunks/${chunkId}`,
          method: 'DELETE',
          timeout: config.storage.requestTimeout,
        },
        (res) => {
          res.resume();
          resolve();
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve();
      });

      req.on('error', () => {
        resolve();
      });

      req.end();
    });
  }

  /**
   * Distribute chunks across healthy storage nodes with replication:
   * 1. Finds active nodes (ignoring offline/failed).
   * 2. Selects R distinct nodes per chunk (no duplicate replicas on the same node).
   * 3. Streams chunks over HTTP with bounded concurrency.
   * 4. Confirms successful storage on each node before inserting chunk_replicas into MySQL.
   * 5. If any replica upload fails, rolls back stored chunks on nodes and throws error to maintain consistency.
   */
  async distributeChunks(
    chunks: Chunk[],
    tempFilePath: string,
    plans: ChunkPlan[],
    healthyNodesOverride?: StorageNodeRecord[],
    replicationFactorOverride?: number
  ): Promise<ChunkPlacement[]> {
    if (chunks.length === 0) {
      return [];
    }

    const replicationFactor = replicationFactorOverride || config.storage.replicationFactor || 2;
    const healthyNodes = healthyNodesOverride || (await this.getHealthyNodes());

    if (healthyNodes.length < replicationFactor) {
      throw new Error(
        `Storage Coordinator Error: Insufficient healthy storage nodes (available: ${healthyNodes.length}, required replication factor: ${replicationFactor}). Check storage nodes.`
      );
    }

    const placements: ChunkPlacement[] = [];
    const successfulUploads: { node: StorageNodeRecord; chunkId: string }[] = [];

    // Map each chunk to its plan and assigned R distinct replica nodes
    const uploadTasks: {
      chunk: Chunk;
      plan: ChunkPlan;
      node: StorageNodeRecord;
      replicaIndex: number;
    }[] = [];

    for (const chunk of chunks) {
      const plan = plans.find((p) => p.sequenceNumber === chunk.sequence_number);
      if (!plan) {
        throw new Error(`Missing chunk plan for sequence number ${chunk.sequence_number}`);
      }

      // Select R distinct nodes for this chunk
      const targetNodes = this.selectNodesForChunk(chunk.sequence_number, healthyNodes, replicationFactor);

      for (let r = 0; r < targetNodes.length; r++) {
        uploadTasks.push({
          chunk,
          plan,
          node: targetNodes[r],
          replicaIndex: r,
        });
      }
    }

    try {
      // Execute chunk uploads with bounded concurrency
      const concurrency = config.storage.concurrency || 4;
      const queue = [...uploadTasks];

      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          const { chunk, plan, node } = item;

          // Stream slice reader
          const streamProvider = () =>
            fs.createReadStream(tempFilePath, {
              start: plan.startByte,
              end: plan.endByte,
              highWaterMark: 64 * 1024,
            });

          // 1. Send HTTP stream to storage node
          await this.uploadChunkToNode(node, chunk.chunk_id, plan.size, streamProvider);
          successfulUploads.push({ node, chunkId: chunk.chunk_id });

          // 2. Confirm storage and record replica in MySQL
          const replica = await chunkReplicaRepository.create(chunk.id, node.id, 'active');

          // 3. Update node used storage
          await storageNodeRepository.updateHeartbeat(node.node_id, node.used_storage + plan.size);

          placements.push({
            chunkId: chunk.chunk_id,
            chunkDbId: chunk.id,
            sequenceNumber: chunk.sequence_number,
            size: plan.size,
            hash: chunk.hash,
            node: {
              id: node.id,
              nodeId: node.node_id,
              host: node.host,
              port: node.port,
            },
            status: 'stored',
            replicaId: replica.id,
          });
        }
      };

      // Run parallel workers up to concurrency limit
      const workers = Array.from({ length: Math.min(concurrency, uploadTasks.length) }, () => worker());
      await Promise.all(workers);

      // Sort placements back into original sequence order
      placements.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      return placements;
    } catch (uploadError) {
      console.error(
        '[StorageCoordinator] Chunk distribution or replication failed. Compensating and rolling back:',
        (uploadError as Error).message
      );

      // Compensation: delete already-stored chunks from storage nodes to avoid orphan binaries
      await Promise.allSettled(
        successfulUploads.map(({ node, chunkId }) => this.deleteChunkFromNode(node, chunkId))
      );

      // Re-throw to trigger upper-layer database metadata rollback
      throw uploadError;
    }
  }
}

export const storageCoordinator = new StorageCoordinator();
