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
};
