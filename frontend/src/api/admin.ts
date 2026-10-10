import apiClient from './client';

export interface AdminNode {
  id?: number;
  nodeId: string;
  host: string;
  port: number;
  url: string;
  status: 'HEALTHY' | 'UNAVAILABLE' | 'FAILED' | string;
  totalStorage: number;
  usedStorage: number;
  availableStorage: number;
  totalCapacity?: number;
  currentUsage?: number;
  utilizationPercent: number;
  activeReplicas: number;
  failedReplicas?: number;
  totalReplicas?: number;
  lastHeartbeat: string | null;
  secondsSinceHeartbeat: number | null;
}

export interface AdminOverviewResponse {
  nodes: {
    total: number;
    healthy: number;
    failed: number;
    unavailable: number;
    list: AdminNode[];
  };
  data: {
    totalFiles: number;
    totalFileBytes: number;
    totalChunks: number;
    totalReplicas: number;
    activeReplicas: number;
    failedReplicas: number;
    replicationFactor: number;
  };
  storage: {
    totalCapacityBytes: number;
    usedStorageBytes: number;
    utilizationPercent: number;
  };
  recovery: {
    recentEvents: any[];
  };
}

export interface ReplicaNodeInfo {
  id: number;
  nodeId: string;
  host: string;
  port: number;
  status: string;
}

export interface ChunkReplicaDetail {
  id: number;
  status: string;
  createdAt: string;
  node: ReplicaNodeInfo;
}

export interface ChunkDetail {
  id: number;
  chunkId: string;
  sequenceNumber: number;
  size: number;
  hash: string;
  replicas: ChunkReplicaDetail[];
}

export interface ReplicationFileItem {
  id: number;
  filename: string;
  size: number;
  chunkCount: number;
  status: string;
  createdAt: string;
  chunks: ChunkDetail[];
}

export interface ReplicationResponse {
  replicationFactor: number;
  fileCount: number;
  files: ReplicationFileItem[];
}

export interface RecoveryEventItem {
  id: number;
  node_id: number | null;
  chunk_id: number | null;
  event_type: 'node_failure' | 'chunk_loss' | 'rebalance' | string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | string;
  created_at: string;
}

export interface RecoveryResponse {
  status: {
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
  };
  eventBreakdown: Record<string, number>;
  events: RecoveryEventItem[];
}

export interface LogItem {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  component: string;
  message: string;
}

export const adminApi = {
  async getOverview(): Promise<AdminOverviewResponse> {
    const response = await apiClient.get<AdminOverviewResponse>('/api/admin/overview');
    return response.data;
  },

  async getNodes(): Promise<{ count: number; nodes: AdminNode[] }> {
    const response = await apiClient.get<{ count: number; nodes: AdminNode[] }>('/api/admin/nodes');
    return response.data;
  },

  async getReplication(): Promise<ReplicationResponse> {
    const response = await apiClient.get<ReplicationResponse>('/api/admin/replication');
    return response.data;
  },

  async getRecovery(): Promise<RecoveryResponse> {
    const response = await apiClient.get<RecoveryResponse>('/api/admin/recovery');
    return response.data;
  },

  async triggerRecovery(): Promise<{ success: boolean; message: string; result: any }> {
    const response = await apiClient.post('/api/admin/recovery/trigger');
    return response.data;
  },

  async simulateNodeFailure(nodeId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/api/admin/nodes/${nodeId}/simulate-failure`);
    return response.data;
  },

  async simulateNodeRestore(nodeId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/api/admin/nodes/${nodeId}/simulate-restore`);
    return response.data;
  },

  async reconcileNode(nodeId: string): Promise<{ success: boolean; message: string; reconciledCount?: number }> {
    const response = await apiClient.post(`/api/admin/nodes/${nodeId}/reconcile`);
    return response.data;
  },

  async getLogs(): Promise<{ count: number; logs: LogItem[] }> {
    const response = await apiClient.get<{ count: number; logs: LogItem[] }>('/api/admin/logs');
    return response.data;
  },
};
