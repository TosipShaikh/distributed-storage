export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  services: {
    mysql: boolean;
    redis: boolean;
  };
}

export interface StorageNodeStatus {
  url: string;
  status: 'online' | 'offline';
  nodeId?: string;
  uptime?: number;
  error?: string;
}

export interface NodesResponse {
  totalNodes: number;
  onlineNodes: number;
  nodes: StorageNodeStatus[];
}

export interface ErrorResponse {
  error: string;
  message: string;
}

// ============================================
// Database Entity Interfaces (Metadata Layer)
// ============================================

export type FileStatus = 'uploading' | 'complete' | 'failed' | 'deleting';
export type NodeStatus = 'HEALTHY' | 'UNAVAILABLE' | 'FAILED' | 'online' | 'offline' | 'maintenance';
export type ReplicaStatus = 'active' | 'syncing' | 'failed';
export type RecoveryEventType = 'node_failure' | 'chunk_loss' | 'rebalance';
export type RecoveryEventStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface NodeRegistrationPayload {
  nodeId: string;
  host: string;
  port: number;
  totalCapacity?: number;
  total_capacity?: number;
  total_storage?: number;
  currentUsage?: number;
  current_usage?: number;
  used_storage?: number;
}

export interface NodeHeartbeatPayload {
  nodeId: string;
  currentUsage?: number;
  current_usage?: number;
  used_storage?: number;
  totalCapacity?: number;
  total_capacity?: number;
  status?: NodeStatus;
}

export interface ClusterNodeInfo {
  id?: number;
  nodeId: string;
  host: string;
  port: number;
  totalCapacity: number;
  currentUsage: number;
  status: NodeStatus;
  lastHeartbeat: string | null;
  sourceOfTruth: 'mysql';
  liveState: 'redis' | 'mysql';
}

export interface ClusterStateResponse {
  cluster: {
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    totalNodes: number;
    healthyNodes: number;
    unavailableNodes: number;
    failedNodes: number;
    totalCapacity: number;
    currentUsage: number;
    availableCapacity: number;
    replicationFactor: number;
    timestamp: string;
  };
  nodes: ClusterNodeInfo[];
}

export interface RecoveryResult {
  recoveredNodes: number;
  recoveredChunks: number;
  failedChunks: number;
  details: string[];
}

export interface RecoveryStatusResponse {
  isRunning: boolean;
  activeJobs: number;
  lastCheck: string | null;
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
}

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface DfsFile {
  id: number;
  user_id: number;
  filename: string;
  size: number;
  chunk_count: number;
  status: FileStatus;
  created_at: Date;
}

export interface Chunk {
  id: number;
  chunk_id: string;
  file_id: number;
  sequence_number: number;
  size: number;
  hash: string;
  created_at: Date;
}

export interface ChunkPlan {
  sequenceNumber: number;
  startByte: number;
  endByte: number;
  size: number;
}

export interface ChunkInfo {
  chunkId: string;
  fileId: number;
  sequenceNumber: number;
  size: number;
  hash: string;
}

export type ChunkStreamProvider = () => NodeJS.ReadableStream;

export type ChunkDispatchHandler = (
  chunk: ChunkInfo,
  createStream: ChunkStreamProvider
) => Promise<void>;

export interface ChunkPlacement {
  chunkId: string;
  chunkDbId: number;
  sequenceNumber: number;
  size: number;
  hash: string;
  node: {
    id: number;
    nodeId: string;
    host: string;
    port: number;
  };
  status: 'stored' | 'failed';
  replicaId?: number;
}

export interface StorageNodeRecord {
  id: number;
  node_id: string;
  host: string;
  port: number;
  total_storage: number;
  used_storage: number;
  status: NodeStatus;
  last_heartbeat: Date | null;
  created_at: Date;
}

export interface ChunkReplica {
  id: number;
  chunk_id: number;
  node_id: number;
  status: ReplicaStatus;
  created_at: Date;
}

export interface RecoveryEvent {
  id: number;
  node_id: number | null;
  chunk_id: number | null;
  event_type: RecoveryEventType;
  status: RecoveryEventStatus;
  created_at: Date;
}

// ============================================
// Authentication Types & Request Augmentation
// ============================================

export type SafeUser = Omit<User, 'password_hash'>;

export interface AuthUserPayload {
  id: number;
  email: string;
  name: string;
}

export interface AuthResponse {
  message: string;
  user: SafeUser;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}


