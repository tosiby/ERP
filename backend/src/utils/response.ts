// =============================================================
// KJSIS — Standardized API Response Helpers
// =============================================================

import { Response } from 'express';
import { ApiSuccess, ApiError, PaginatedData } from '../types';

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200,
): Response => {
  const body: ApiSuccess<T> = { success: true, data, ...(message ? { message } : {}) };
  return res.status(statusCode).json(body);
};

export const sendCreated = <T>(res: Response, data: T, message?: string): Response => {
  return sendSuccess(res, data, message, 201);
};

export const sendError = (
  res: Response,
  error: string,
  statusCode = 400,
  details?: unknown,
): Response => {
  const body: ApiError = { success: false, error, ...(details ? { details } : {}) };
  return res.status(statusCode).json(body);
};

export const sendPaginated = <T>(
  res: Response,
  paginatedData: PaginatedData<T>,
): Response => {
  return sendSuccess(res, paginatedData);
};
