-- Distributed File Storage System - Metadata Schema
-- MySQL stores METADATA only. File/chunk binary data remains on storage nodes.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  chunk_count INT NOT NULL DEFAULT 0,
  status ENUM('uploading', 'complete', 'failed', 'deleting') NOT NULL DEFAULT 'uploading',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_files_user_id (user_id),
  INDEX idx_files_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chunks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_id INT NOT NULL,
  sequence_number INT NOT NULL,
  size BIGINT NOT NULL,
  hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  UNIQUE KEY uk_file_chunk_seq (file_id, sequence_number),
  INDEX idx_chunks_file_id (file_id),
  INDEX idx_chunks_hash (hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS storage_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id VARCHAR(64) NOT NULL UNIQUE,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  total_storage BIGINT NOT NULL DEFAULT 0,
  used_storage BIGINT NOT NULL DEFAULT 0,
  status ENUM('online', 'offline', 'maintenance') NOT NULL DEFAULT 'offline',
  last_heartbeat TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_storage_nodes_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chunk_replicas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chunk_id INT NOT NULL,
  node_id INT NOT NULL,
  status ENUM('active', 'syncing', 'failed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES storage_nodes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_chunk_replica_node (chunk_id, node_id),
  INDEX idx_chunk_replicas_chunk_id (chunk_id),
  INDEX idx_chunk_replicas_node_id (node_id),
  INDEX idx_chunk_replicas_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  node_id INT NULL,
  chunk_id INT NULL,
  event_type ENUM('node_failure', 'chunk_loss', 'rebalance') NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES storage_nodes(id) ON DELETE SET NULL,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE SET NULL,
  INDEX idx_recovery_events_node_id (node_id),
  INDEX idx_recovery_events_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
