// =============================================================
// KJSIS — Global Error Handler (Phase 2: with error codes)
// =============================================================

import { Request, Response, NextFunction } from 'express';
import { AppError, ImportValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Import errors — include failed rows in response
  if (err instanceof ImportValidationError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
      failed_rows: err.failedRows,
    });
    return;
  }

  // Operational (known) errors — safe to expose message
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational server error', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown errors — never expose internals to client
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
};
