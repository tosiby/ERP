// =============================================================
// KJSIS — Typed Application Errors with Error Codes
// Phase 2: Every error carries a machine-readable code
// =============================================================

export type ErrorCode =
  // Auth
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DEACTIVATED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REVOKED'
  | 'UNAUTHORIZED'
  // Validation
  | 'VALIDATION_ERROR'
  | 'INVALID_INPUT'
  | 'DUPLICATE_ENTRY'
  // Access
  | 'FORBIDDEN'
  | 'ROLE_INSUFFICIENT'
  // Domain
  | 'EXAM_LOCKED'
  | 'MARKS_ALREADY_SUBMITTED'
  | 'MARKS_ALREADY_LOCKED'
  | 'SUBJECT_CLASS_MISMATCH'
  | 'ELECTIVE_CONFLICT'
  | 'TEACHER_NOT_ASSIGNED'
  | 'ATTENDANCE_SUNDAY'
  | 'ATTENDANCE_SATURDAY_NO_OVERRIDE'
  | 'IMPORT_VALIDATION_FAILED'
  // Resources
  | 'NOT_FOUND'
  | 'CONFLICT'
  // System
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: ErrorCode;

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = 'INTERNAL_ERROR',
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code: ErrorCode = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', code: ErrorCode = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: ErrorCode = 'VALIDATION_ERROR') {
    super(message, 422, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = 'DUPLICATE_ENTRY') {
    super(message, 409, code);
  }
}

export class ExamLockedError extends AppError {
  constructor() {
    super('This exam is locked. Marks cannot be modified.', 423, 'EXAM_LOCKED');
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED');
  }
}

export class TokenRevokedError extends AppError {
  constructor() {
    super('Token has been revoked', 401, 'TOKEN_REVOKED');
  }
}

export class ImportValidationError extends AppError {
  public readonly failedRows: ImportFailedRow[];

  constructor(message: string, failedRows: ImportFailedRow[]) {
    super(message, 422, 'IMPORT_VALIDATION_FAILED');
    this.failedRows = failedRows;
  }
}

export interface ImportFailedRow {
  row: number;
  data: Record<string, unknown>;
  reason: string;
}
