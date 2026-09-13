import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${err.stack || err.message || err}`);

  const statusCode = err.statusCode || err.status || 500;
  const response: ErrorResponse = {
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred on the storage node.',
  };

  res.status(statusCode).json(response);
}
