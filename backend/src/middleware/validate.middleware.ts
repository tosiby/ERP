// =============================================================
// KJSIS — Zod Request Validation Middleware
// =============================================================

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

type ValidationTarget = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, target: ValidationTarget = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      sendError(res, 'Validation failed', 422, formatted);
      return;
    }

    // Replace with parsed + coerced data
    req[target] = result.data;
    next();
  };
};

const formatZodErrors = (error: ZodError): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }

  return errors;
};
