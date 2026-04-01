// =============================================================
// KJSIS — Role-Based Access Control Middleware
// =============================================================

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
import { sendError } from '../utils/response';

/**
 * Restrict access to specific roles.
 * Usage: authorize('super_admin', 'exam_cell')
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        403,
      );
      return;
    }

    next();
  };
};

/**
 * Convenience role groups
 */
export const Roles = {
  ADMIN_ONLY: ['super_admin'] as UserRole[],
  ADMIN_EXAM: ['super_admin', 'exam_cell'] as UserRole[],
  TEACHER_AND_ABOVE: ['super_admin', 'exam_cell', 'teacher'] as UserRole[],
  LEADERSHIP: ['super_admin', 'vp', 'principal'] as UserRole[],
  ALL_STAFF: ['super_admin', 'exam_cell', 'teacher', 'vp', 'principal'] as UserRole[],
  REPORTS_ACCESS: ['super_admin', 'exam_cell', 'vp', 'principal'] as UserRole[],
};
