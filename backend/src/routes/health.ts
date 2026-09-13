import { Router, Request, Response } from 'express';
import { testDbConnection } from '../config/db';
import { testRedisConnection } from '../config/redis';
import { HealthStatus } from '../types';

const router = Router();

/**
 * GET /api/health
 * Returns the health status of the backend and its dependencies.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const [mysqlOk, redisOk] = await Promise.all([
    testDbConnection(),
    testRedisConnection(),
  ]);

  const allHealthy = mysqlOk && redisOk;

  const response: HealthStatus = {
    status: allHealthy ? 'ok' : mysqlOk || redisOk ? 'degraded' : 'error',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      mysql: mysqlOk,
      redis: redisOk,
    },
  };

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(response);
});

export default router;
