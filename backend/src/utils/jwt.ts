// =============================================================
// KJSIS — JWT Utilities (Phase 2: access + refresh tokens)
// =============================================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
};

// ─── Access Token (short-lived) ───────────────────────────────
export const signAccessToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',  // short-lived in Phase 2
  } as jwt.SignOptions);
};

// Backward-compatible alias used by existing code
export const signToken = signAccessToken;

// ─── Refresh Token (opaque, stored in DB) ────────────────────
export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

// ─── Verify Access Token ──────────────────────────────────────
export const verifyToken = (token: string): JwtPayload => {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      const { TokenExpiredError } = require('./errors');
      throw new TokenExpiredError();
    }
    const { UnauthorizedError } = require('./errors');
    throw new UnauthorizedError('Invalid token', 'TOKEN_INVALID');
  }
};
