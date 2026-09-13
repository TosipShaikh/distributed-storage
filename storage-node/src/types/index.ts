export interface HealthResponse {
  status: 'ok' | 'error';
  nodeId: string;
  uptime: number;
  timestamp: string;
  dataDir: string;
}

export interface StatsResponse {
  nodeId: string;
  totalStorage: number;
  usedStorage: number;
  availableStorage: number;
  numberOfChunks: number;
}

export interface ChunkUploadResponse {
  success: boolean;
  message: string;
  nodeId: string;
  chunkId: string;
  size: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
