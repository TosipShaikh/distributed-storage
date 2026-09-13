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
