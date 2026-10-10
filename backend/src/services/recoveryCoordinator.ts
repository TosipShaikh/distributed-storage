import crypto from 'crypto';
import { Readable } from 'stream';
import redis from '../config/redis';
import { config } from '../config';
import { storageNodeRepository } from '../repositories/storageNodeRepository';
import { chunkRepository } from '../repositories/chunkRepository';
import { chunkReplicaRepository } from '../repositories/chunkReplicaRepository';
import { recoveryEventRepository } from '../repositories/recoveryEventRepository';
import { nodeHealthService } from './nodeHealthService';
import { storageCoordinator } from './storageCoordinator';
import {
  StorageNodeRecord,
  Chunk,
  ChunkReplica,
  RecoveryResult,
  RecoveryStatusResponse,
} from '../types';

export class RecoveryCoordinator {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private inMemoryLocks = new Set<string>();
  private lastCheckTimestamp: string | null = null;

  /**
   * Acquire a distributed lock via Redis (with local fallback if Redis is unavailable).
   */
  async acquireLock(lockKey: string, ttlSeconds: number = 60): Promise<boolean> {
    try {
      const result = await redis.set(lockKey, 'locked', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      // Local fallback lock for test environments or Redis disconnections
      if (this.inMemoryLocks.has(lockKey)) {
        return false;
      }
      this.inMemoryLocks.add(lockKey);
      return true;
    }
  }

  /**
   * Release a distributed lock.
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      await redis.del(lockKey);
    } catch {
      // Ignore Redis errors
    }
    this.inMemoryLocks.delete(lockKey);
  }

  /**
   * Start the background node failure monitoring and recovery service.
   */
  start(intervalMs?: number): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    const interval = intervalMs || config.recovery?.intervalMs || 5000;
    console.log(`[RecoveryCoordinator] Starting background failure detector (interval: ${interval}ms)`);

    this.timer = setInterval(async () => {
      try {
        await this.checkAndRecoverNodes();
      } catch (err) {
        console.error('[RecoveryCoordinator] Background cycle error:', (err as Error).message);
      }
    }, interval);
  }

  /**
   * Stop the background monitoring service.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[RecoveryCoordinator] Background monitoring service stopped.');
    }
  }

  /**
   * Check heartbeat timestamps of all nodes, mark failed nodes, and trigger recovery.
   * Can be triggered on-demand via API or background cycle.
   */
  async checkAndRecoverNodes(): Promise<RecoveryResult> {
    if (this.isProcessing) {
      return {
        recoveredNodes: 0,
        recoveredChunks: 0,
        failedChunks: 0,
        details: ['Recovery cycle already in progress, skipped duplicate trigger'],
      };
    }

    this.isProcessing = true;
    this.lastCheckTimestamp = new Date().toISOString();

    const result: RecoveryResult = {
      recoveredNodes: 0,
      recoveredChunks: 0,
      failedChunks: 0,
      details: [],
    };

    try {
      const allNodes = await storageNodeRepository.findAll();
      const heartbeatTimeoutMs = config.heartbeat?.timeoutMs || 15000;
      const now = Date.now();

      for (const node of allNodes) {
        // Skip nodes statically marked maintenance
        if (node.status === 'maintenance') {
          continue;
        }

        let isOverdue = false;

        // Check if heartbeat timestamp has exceeded timeout
        if (node.last_heartbeat) {
          const lastHb = new Date(node.last_heartbeat).getTime();
          if (now - lastHb > heartbeatTimeoutMs) {
            isOverdue = true;
          }
        } else if (node.status === 'HEALTHY' || node.status === 'online') {
          isOverdue = true;
        }

        // Check for node failure
        if (isOverdue || node.status === 'FAILED') {
          if (node.status !== 'FAILED') {
            console.warn(
              `[RecoveryCoordinator] Node '${node.node_id}' heartbeat overdue (> ${heartbeatTimeoutMs}ms). Marking as FAILED.`
            );
            await storageNodeRepository.updateStatus(node.node_id, 'FAILED');
            await nodeHealthService.setNodeStatus(node.node_id, 'FAILED');
            node.status = 'FAILED';
          }

          // Trigger replica recovery for this failed node
          const nodeRecovery = await this.recoverFailedNode(node);
          if (nodeRecovery.recoveredChunks > 0 || nodeRecovery.affectedChunks > 0) {
            result.recoveredNodes++;
            result.recoveredChunks += nodeRecovery.recoveredChunks;
            result.failedChunks += nodeRecovery.failedChunks;
            result.details.push(
              `Node '${node.node_id}': recovered ${nodeRecovery.recoveredChunks}/${nodeRecovery.affectedChunks} chunks`
            );
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Recover all chunk replicas that were hosted on a failed storage node.
   */
  async recoverFailedNode(
    failedNode: StorageNodeRecord
  ): Promise<{ affectedChunks: number; recoveredChunks: number; failedChunks: number }> {
    const lockKey = `lock:recovery:node:${failedNode.id}`;
    const acquired = await this.acquireLock(lockKey, 60);

    if (!acquired) {
      console.log(`[RecoveryCoordinator] Node '${failedNode.node_id}' is already being recovered by another job.`);
      return { affectedChunks: 0, recoveredChunks: 0, failedChunks: 0 };
    }

    let affectedChunks = 0;
    let recoveredChunks = 0;
    let failedChunks = 0;
    let eventId: number | null = null;

    try {
      // 1. Find all chunk replicas hosted on this failed node
      const replicasOnFailedNode = await chunkReplicaRepository.findByNodeId(failedNode.id);

      if (replicasOnFailedNode.length === 0) {
        return { affectedChunks: 0, recoveredChunks: 0, failedChunks: 0 };
      }

      affectedChunks = replicasOnFailedNode.length;
      console.log(
        `[RecoveryCoordinator] Initiating recovery for failed node '${failedNode.node_id}' (${affectedChunks} affected chunks)`
      );

      // Record recovery event
      try {
        const event = await recoveryEventRepository.create(
          failedNode.id,
          null,
          'node_failure',
          'in_progress'
        );
        eventId = event.id;
      } catch (err) {
        console.warn('[RecoveryCoordinator] Could not log recovery event start:', (err as Error).message);
      }

      // 2. Mark replicas on this failed node as 'failed' in MySQL
      for (const replica of replicasOnFailedNode) {
        if (replica.status !== 'failed') {
          await chunkReplicaRepository.updateStatus(replica.id, 'failed');
          replica.status = 'failed';
        }
      }

      // 3. Process each affected chunk independently (error isolation)
      for (const replica of replicasOnFailedNode) {
        try {
          const chunkRes = await this.recoverChunk(replica.chunk_id, failedNode);
          if (chunkRes.status === 'recovered') {
            recoveredChunks++;
          } else if (chunkRes.status === 'failed') {
            failedChunks++;
          }
          // If chunkRes.status === 'skipped', do not increment recoveredChunks or failedChunks
        } catch (chunkErr) {
          failedChunks++;
          console.error(
            `[RecoveryCoordinator] Failed recovering chunk ID ${replica.chunk_id} from node '${failedNode.node_id}':`,
            (chunkErr as Error).message
          );
        }
      }

      // Update recovery event status
      if (eventId) {
        const finalStatus = failedChunks === 0 ? 'completed' : recoveredChunks > 0 ? 'completed' : 'failed';
        await recoveryEventRepository.updateStatus(eventId, finalStatus);
      }
    } finally {
      await this.releaseLock(lockKey);
    }

    return { affectedChunks, recoveredChunks, failedChunks };
  }

  /**
   * Recover a single chunk to restore the required REPLICATION_FACTOR.
   * Idempotent: if the chunk already has >= REPLICATION_FACTOR healthy replicas, returns 'skipped'.
   */
  async recoverChunk(
    chunkDbId: number,
    failedNode?: StorageNodeRecord
  ): Promise<{ status: 'recovered' | 'skipped' | 'failed'; targetNodeId?: string; error?: string }> {
    const chunkLockKey = `lock:recovery:chunk:${chunkDbId}`;
    const acquired = await this.acquireLock(chunkLockKey, 30);

    if (!acquired) {
      console.log(`[RecoveryCoordinator] Chunk ${chunkDbId} is currently being recovered by another job.`);
      return { status: 'skipped', error: 'locked' };
    }

    try {
      const targetReplicationFactor = config.storage?.replicationFactor || 2;

      // 1. Retrieve chunk metadata
      const chunk = await chunkRepository.findById(chunkDbId);
      if (!chunk) {
        console.warn(`[RecoveryCoordinator] Chunk DB ID ${chunkDbId} not found in database.`);
        return { status: 'failed', error: 'chunk_not_found' };
      }

      // 2. Query all registered nodes to check health
      const allRegisteredNodes = await storageNodeRepository.findAll();
      const nodeMap = new Map<number, StorageNodeRecord>(allRegisteredNodes.map((n) => [n.id, n]));

      // 3. Check existing replicas for this chunk
      const allReplicas = await chunkReplicaRepository.findByChunkId(chunkDbId);
      const activeHealthyReplicas: ChunkReplica[] = [];
      const nodesHoldingReplicas = new Set<number>();

      for (const rep of allReplicas) {
        const node = nodeMap.get(rep.node_id);
        if (node && (node.status === 'HEALTHY' || node.status === 'online') && rep.status === 'active') {
          activeHealthyReplicas.push(rep);
          nodesHoldingReplicas.add(node.id);
        }
      }

      // 4. Idempotency Check: if already has sufficient healthy replicas, nothing to do!
      if (activeHealthyReplicas.length >= targetReplicationFactor) {
        console.log(
          `[RecoveryCoordinator] Chunk '${chunk.chunk_id}' already has ${activeHealthyReplicas.length} healthy replicas (target: ${targetReplicationFactor}). Skipping.`
        );
        return { status: 'skipped' };
      }

      // 5. Verify that at least one healthy surviving replica exists
      if (activeHealthyReplicas.length === 0) {
        console.error(
          `[RecoveryCoordinator] CRITICAL: Chunk '${chunk.chunk_id}' has 0 surviving healthy replicas! Cannot recover.`
        );
        await recoveryEventRepository.create(null, chunkDbId, 'chunk_loss', 'failed');
        return { status: 'failed', error: 'no_surviving_replicas' };
      }

      // 6. Find candidate healthy target nodes
      const candidateNodes = allRegisteredNodes.filter((node) => {
        // Must be healthy
        if (node.status !== 'HEALTHY' && node.status !== 'online') {
          return false;
        }
        // Must not be the failed node
        if (failedNode && node.id === failedNode.id) {
          return false;
        }
        // Must not already hold a replica for this chunk
        if (nodesHoldingReplicas.has(node.id)) {
          return false;
        }
        return true;
      });

      if (candidateNodes.length === 0) {
        console.warn(
          `[RecoveryCoordinator] Insufficient healthy nodes available to replicate chunk '${chunk.chunk_id}'. Need 1, available 0.`
        );
        await recoveryEventRepository.create(null, chunkDbId, 'chunk_loss', 'failed');
        return { status: 'failed', error: 'insufficient_nodes' };
      }

      // 7. Verify chunk data integrity using SHA-256 before replication
      const chunkBuffer = await storageCoordinator.downloadChunkWithFallback(
        chunk,
        activeHealthyReplicas,
        nodeMap
      );

      const computedHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
      if (computedHash !== chunk.hash) {
        console.error(
          `[RecoveryCoordinator] SHA-256 integrity verification failed for chunk '${chunk.chunk_id}'. Skipping replication.`
        );
        await recoveryEventRepository.create(null, chunkDbId, 'chunk_loss', 'failed');
        return { status: 'failed', error: 'hash_mismatch' };
      }

      // 8. Select target node and upload with retry logic
      const neededReplicaCount = targetReplicationFactor - activeHealthyReplicas.length;
      let createdCount = 0;
      let lastUploadedNodeId: string | undefined;

      for (const targetNode of candidateNodes) {
        if (createdCount >= neededReplicaCount) {
          break;
        }

        const uploaded = await this.uploadWithRetry(targetNode, chunk, chunkBuffer);
        if (uploaded) {
          // Record replica in MySQL
          await chunkReplicaRepository.create(chunkDbId, targetNode.id, 'active');

          // Update target node used storage
          await storageNodeRepository.updateHeartbeat(
            targetNode.node_id,
            targetNode.used_storage + chunkBuffer.length,
            targetNode.total_storage,
            targetNode.status
          );

          // Log recovery event in database
          await recoveryEventRepository.create(targetNode.id, chunkDbId, 'chunk_loss', 'completed');

          console.log(
            `[RecoveryCoordinator] Successfully placed replacement replica for chunk '${chunk.chunk_id}' on '${targetNode.node_id}'`
          );

          createdCount++;
          lastUploadedNodeId = targetNode.node_id;
        }
      }

      if (createdCount > 0) {
        return { status: 'recovered', targetNodeId: lastUploadedNodeId };
      } else {
        await recoveryEventRepository.create(null, chunkDbId, 'chunk_loss', 'failed');
        return { status: 'failed', error: 'all_candidate_uploads_failed' };
      }
    } finally {
      await this.releaseLock(chunkLockKey);
    }
  }

  /**
   * Upload chunk binary to target node with retries and exponential backoff.
   */
  private async uploadWithRetry(
    targetNode: StorageNodeRecord,
    chunk: Chunk,
    buffer: Buffer
  ): Promise<boolean> {
    const maxRetries = config.recovery?.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await storageCoordinator.uploadChunkToNode(
          targetNode,
          chunk.chunk_id,
          buffer.length,
          () => Readable.from(buffer)
        );
        return true;
      } catch (uploadErr) {
        console.warn(
          `[RecoveryCoordinator] Attempt ${attempt}/${maxRetries} to upload chunk '${chunk.chunk_id}' to '${targetNode.node_id}' failed: ${(uploadErr as Error).message}`
        );
        if (attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 200 * attempt));
        }
      }
    }

    return false;
  }

  /**
   * Get current operational status and metrics for the recovery subsystem.
   */
  async getStatus(): Promise<RecoveryStatusResponse> {
    const stats = await recoveryEventRepository.getStats();

    return {
      isRunning: this.timer !== null,
      activeJobs: this.isProcessing ? 1 : 0,
      lastCheck: this.lastCheckTimestamp,
      stats,
    };
  }
}

export const recoveryCoordinator = new RecoveryCoordinator();
