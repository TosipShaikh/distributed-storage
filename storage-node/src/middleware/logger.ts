import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, originalUrl } = req;
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    console.log(`[${timestamp}] [${config.nodeId}] ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
  });

  next();
}
