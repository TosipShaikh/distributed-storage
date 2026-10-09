import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeId: process.env.NODE_ID || 'node-unknown',
  host: process.env.NODE_HOST || process.env.HOST || 'localhost',
  port: parseInt(process.env.PORT || '5001', 10),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '../../data'),
  backendUrl: process.env.BACKEND_URL || process.env.COORDINATOR_URL || 'http://localhost:4000',
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10),
};
