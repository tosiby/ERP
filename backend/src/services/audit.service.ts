// =============================================================
// KJSIS — Audit Log Service
// Design: fire-and-forget (non-blocking). Audit failures must
// NEVER crash the main request. Logged to console if DB fails.
// =============================================================

import { query } from '../utils/db';
import { logger } from '../utils/logger';

type AuditAction =
  | 'create' | 'update' | 'delete'
  | 'login' | 'logout'
  | 'marks_submit' | 'marks_lock' | 'marks_unlock'
  | 'teacher_assign' | 'teacher_unassign'
  | 'exam_lock'
  | 'student_import'
  | 'password_change';

interface AuditPayload {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ─── Core log function ────────────────────────────────────────
export const auditLog = (payload: AuditPayload): void => {
  // Fire and forget — intentionally not awaited
  _writeAuditLog(payload).catch((err) => {
    logger.warn('Audit log write failed (non-fatal)', { err: err.message, payload });
  });
};

const _writeAuditLog = async (payload: AuditPayload): Promise<void> => {
  await query(
    `INSERT INTO audit_logs
       (user_id, action, entity_type, entity_id,
        before_data, after_data, metadata, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      payload.userId,
      payload.action,
      payload.entityType,
      payload.entityId ?? null,
      payload.beforeData ? JSON.stringify(payload.beforeData) : null,
      payload.afterData ? JSON.stringify(payload.afterData) : null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.ipAddress ?? null,
      payload.userAgent ?? null,
    ],
  );
};

// ─── Query audit logs (admin view) ───────────────────────────
export const getAuditLogs = async (options: {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) => {
  const { entityType, entityId, userId, action, from, to, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (userId) {
    conditions.push(`al.user_id = $${paramIdx++}`);
    params.push(userId);
  }
  if (action) {
    conditions.push(`al.action = $${paramIdx++}`);
    params.push(action);
  }
  if (entityType) {
    conditions.push(`al.entity_type = $${paramIdx++}`);
    params.push(entityType);
  }
  if (entityId) {
    conditions.push(`al.entity_id = $${paramIdx++}`);
    params.push(entityId);
  }
  if (from) {
    conditions.push(`al.created_at >= $${paramIdx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`al.created_at <= $${paramIdx++}`);
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [logsResult, countResult] = await Promise.all([
    query(
      `SELECT
         al.id, al.action, al.entity_type, al.entity_id,
         al.before_data, al.after_data, al.metadata,
         al.ip_address, al.created_at,
         u.name AS user_name, u.role AS user_role
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM audit_logs al ${where}`,
      params,
    ),
  ]);

  return {
    items: logsResult.rows,
    total: parseInt(countResult.rows[0]?.count ?? '0'),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0]?.count ?? '0') / limit),
  };
};

// ─── Express middleware: attach audit context to req ──────────
import { Request, Response, NextFunction } from 'express';

export const auditMiddleware = (action: AuditAction, entityType: string) => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // Augment req with audit helper — called from controller after success
    (_req as Request & { audit: typeof auditLog }).audit = auditLog;
    next();
  };
};
