import Redis from 'ioredis';
import { config } from './index';

/**
 * Redis client instance.
 * Used for caching and ephemeral state management.
 */
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: process.env.NODE_ENV === 'test',
  maxRetriesPerRequest: process.env.NODE_ENV === 'test' ? 1 : 3,
  retryStrategy(times: number) {
    if (process.env.NODE_ENV === 'test') return null;
    const delay = Math.min(times * 200, 3000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err: Error) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Redis] Connection error:', err.message);
  }
});

/**
 * Test the Redis connection.
 * Returns true if successful, false otherwise.
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis] Ping failed:', (error as Error).message);
    return false;
  }
}

export default redis;
