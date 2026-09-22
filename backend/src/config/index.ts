import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'dfs_user',
    password: process.env.MYSQL_PASSWORD || 'dfs_password',
    database: process.env.MYSQL_DATABASE || 'distributed_file_storage',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  storageNodes: (process.env.STORAGE_NODES || '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0),

  jwt: {
    secret: process.env.JWT_SECRET || 'dfs_super_secret_jwt_key_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  upload: {
    tempDir: process.env.UPLOAD_TEMP_DIR || path.resolve(process.cwd(), 'uploads-temp'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000', 10), // 500MB
  },
};

