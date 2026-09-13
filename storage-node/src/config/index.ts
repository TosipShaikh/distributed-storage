import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeId: process.env.NODE_ID || 'node-unknown',
  port: parseInt(process.env.PORT || '5001', 10),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '../../data'),
};
