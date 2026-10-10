export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export type FileHealthStatus = 'HEALTHY' | 'DEGRADED' | 'RECOVERING';

export interface ChunkInfo {
  id: number;
  chunk_id: string;
  sequence_number: number;
  size: number;
  hash: string;
  replica_count?: number;
  status?: 'healthy' | 'recovering' | 'degraded';
}

export interface FileItem {
  id: number;
  user_id: number;
  filename: string;
  size: number;
  chunk_count: number;
  status: 'uploading' | 'complete' | 'failed' | 'deleting';
  health_status?: FileHealthStatus;
  replication_factor?: number;
  created_at: string;
  chunks?: ChunkInfo[];
}

export interface FileListResponse {
  count: number;
  files: FileItem[];
}

export interface UploadProgress {
  percentage: number;
  loaded: number;
  total: number;
  fileName: string;
  isUploading: boolean;
}
