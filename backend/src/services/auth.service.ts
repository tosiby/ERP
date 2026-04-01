// =============================================================
// KJSIS — Auth Service (Phase 2: refresh tokens + FCM)
// =============================================================

import bcrypt from 'bcryptjs';
import { query } from '../utils/db';
import { signAccessToken, generateRefreshToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  TokenRevokedError,
} from '../utils/errors';
import { User } from '../types';
import { LoginInput, ChangePasswordInput } from '../schemas/auth.schema';

const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30');

// ─── Types ────────────────────────────────────────────────────
interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  user: Omit<User, 'password_hash'>;
}

// =============================================================
// LOGIN — returns both tokens
// =============================================================
export const login = async (
  input: LoginInput,
  ipAddress?: string,
  userAgent?: string,
): Promise<LoginResult> => {
  const { mobile, password } = input;

  const result = await query<User & { password_hash: string }>(
    `SELECT id, name, mobile, password_hash, role, is_active, created_at, updated_at
     FROM users WHERE mobile = $1 LIMIT 1`,
    [mobile],
  );

  const user = result.rows[0];

  if (!user) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  if (!user.is_active)
    throw new ForbiddenError('Account is deactivated. Contact administrator.', 'ACCOUNT_DEACTIVATED');

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');

  // Issue tokens
  const access_token = signAccessToken({ userId: user.id, role: user.role });
  const refresh_token = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refresh_token, expiresAt, ipAddress ?? null, userAgent ?? null],
  );

  const { password_hash: _, ...safeUser } = user;

  logger.info('User logged in', { userId: user.id, role: user.role });

  return {
    access_token,
    refresh_token,
    expires_in: process.env.JWT_EXPIRES_IN ?? '15m',
    user: safeUser as Omit<User, 'password_hash'>,
  };
};

// =============================================================
// REFRESH — exchange refresh token for new access token
// =============================================================
export const refreshAccessToken = async (
  refreshToken: string,
): Promise<{ access_token: string; expires_in: string }> => {
  const result = await query<{
    id: string;
    user_id: string;
    expires_at: Date;
    is_revoked: boolean;
  }>(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.is_revoked,
            u.role, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token = $1
     LIMIT 1`,
    [refreshToken],
  );

  const token = result.rows[0] as typeof result.rows[0] & {
    role: string;
    is_active: boolean;
  };

  if (!token) throw new UnauthorizedError('Invalid refresh token', 'TOKEN_INVALID');
  if (token.is_revoked) throw new TokenRevokedError();
  if (new Date() > new Date(token.expires_at))
    throw new UnauthorizedError('Refresh token expired', 'TOKEN_EXPIRED');
  if (!token.is_active)
    throw new ForbiddenError('Account is deactivated', 'ACCOUNT_DEACTIVATED');

  const access_token = signAccessToken({
    userId: token.user_id,
    role: token.role as User['role'],
  });

  return { access_token, expires_in: process.env.JWT_EXPIRES_IN ?? '15m' };
};

// =============================================================
// LOGOUT — revoke refresh token
// =============================================================
export const logout = async (refreshToken: string): Promise<void> => {
  await query(
    `UPDATE refresh_tokens
     SET is_revoked = TRUE, revoked_at = NOW()
     WHERE token = $1`,
    [refreshToken],
  );
  logger.info('Refresh token revoked');
};

// =============================================================
// LOGOUT ALL — revoke all tokens for user (security action)
// =============================================================
export const logoutAll = async (userId: string): Promise<void> => {
  await query(
    `UPDATE refresh_tokens
     SET is_revoked = TRUE, revoked_at = NOW()
     WHERE user_id = $1 AND is_revoked = FALSE`,
    [userId],
  );
  logger.info('All sessions revoked', { userId });
};

// =============================================================
// REGISTER FCM TOKEN
// =============================================================
export const registerFcmToken = async (
  userId: string,
  fcmToken: string,
  device?: string,
): Promise<void> => {
  await query(
    `INSERT INTO fcm_tokens (user_id, fcm_token, device)
     VALUES ($1, $2, $3)
     ON CONFLICT (fcm_token)
     DO UPDATE SET user_id = EXCLUDED.user_id, device = EXCLUDED.device, updated_at = NOW()`,
    [userId, fcmToken, device ?? null],
  );
};

// =============================================================
// CHANGE PASSWORD
// =============================================================
export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const { current_password, new_password } = input;

  const result = await query<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE id = $1`,
    [userId],
  );

  const user = result.rows[0];
  if (!user) throw new NotFoundError('User');

  const isMatch = await bcrypt.compare(current_password, user.password_hash);
  if (!isMatch) throw new ValidationError('Current password is incorrect');

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12');
  const newHash = await bcrypt.hash(new_password, rounds);

  await query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [newHash, userId],
  );

  // Revoke all existing refresh tokens on password change (security best practice)
  await logoutAll(userId);

  logger.info('Password changed, all sessions revoked', { userId });
};

// =============================================================
// GET MY PROFILE
// =============================================================
export const getMyProfile = async (userId: string): Promise<Omit<User, 'password_hash'>> => {
  const result = await query<Omit<User, 'password_hash'>>(
    `SELECT id, name, mobile, role, is_active, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId],
  );

  const user = result.rows[0];
  if (!user) throw new NotFoundError('User');
  return user;
};

// =============================================================
// GET MY SUBJECTS (teacher home screen)
// =============================================================
export const getMySubjects = async (
  teacherId: string,
  academicYearId?: string,
): Promise<unknown[]> => {
  const yearQuery = academicYearId
    ? `SELECT id FROM academic_years WHERE id = $1`
    : `SELECT id FROM academic_years WHERE is_current = TRUE LIMIT 1`;

  const yearResult = await query<{ id: string }>(
    yearQuery,
    academicYearId ? [academicYearId] : [],
  );

  const year = yearResult.rows[0];
  if (!year) throw new NotFoundError('Academic year');

  const result = await query(
    `SELECT
       tsm.id            AS assignment_id,
       s.id              AS subject_id,
       s.name            AS subject_name,
       s.code            AS subject_code,
       c.id              AS class_id,
       c.name            AS class_name,
       d.id              AS division_id,
       d.name            AS division_name,
       -- Mark entry status for current exams
       (
         SELECT COUNT(*) FROM marks m
         JOIN exams e ON m.exam_id = e.id
         WHERE m.teacher_id = tsm.teacher_id
           AND m.subject_id = tsm.subject_id
           AND e.academic_year_id = $2
           AND m.status = 'submitted'
       ) AS submitted_count,
       (
         SELECT COUNT(*) FROM marks m
         JOIN exams e ON m.exam_id = e.id
         WHERE m.teacher_id = tsm.teacher_id
           AND m.subject_id = tsm.subject_id
           AND e.academic_year_id = $2
           AND m.status = 'draft'
       ) AS draft_count
     FROM teacher_subject_map tsm
     JOIN subjects    s ON tsm.subject_id  = s.id
     JOIN divisions   d ON tsm.division_id = d.id
     JOIN classes     c ON d.class_id      = c.id
     WHERE tsm.teacher_id       = $1
       AND tsm.academic_year_id = $2
       AND tsm.is_active        = TRUE
       AND s.is_active          = TRUE
     ORDER BY c.grade_number, d.name, s.display_order`,
    [teacherId, year.id],
  );

  return result.rows;
};
