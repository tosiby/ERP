// =============================================================
// KJSIS — Auth Refresh Token Tests (Phase 2)
// =============================================================

import { UnauthorizedError, TokenRevokedError, ForbiddenError } from '../utils/errors';

jest.mock('../utils/db',  () => ({ query: jest.fn() }));
jest.mock('../utils/jwt', () => ({
  signAccessToken:      jest.fn(() => 'new-access-token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token-64chars'),
  verifyToken:          jest.fn(),
  signToken:            jest.fn(() => 'mock-access-token'),
}));
jest.mock('bcryptjs', () => ({ compare: jest.fn(), hash: jest.fn() }));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { query } from '../utils/db';
import * as AuthService from '../services/auth.service';

const mockQuery = query as jest.Mock;
beforeEach(() => jest.clearAllMocks());

describe('refreshAccessToken', () => {
  it('throws UnauthorizedError for unknown token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      AuthService.refreshAccessToken('unknown-token'),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws TokenRevokedError for revoked token', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1', user_id: 'u1',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: true,
        role: 'teacher', is_active: true,
      }],
    });
    await expect(
      AuthService.refreshAccessToken('revoked-token'),
    ).rejects.toThrow(TokenRevokedError);
  });

  it('throws UnauthorizedError for expired token', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'rt-2', user_id: 'u1',
        expires_at: new Date(Date.now() - 1000),  // expired yesterday
        is_revoked: false,
        role: 'teacher', is_active: true,
      }],
    });
    await expect(
      AuthService.refreshAccessToken('expired-token'),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('returns new access token for valid refresh token', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'rt-3', user_id: 'u1',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
        role: 'teacher', is_active: true,
      }],
    });
    const result = await AuthService.refreshAccessToken('valid-token');
    expect(result.access_token).toBe('new-access-token');
  });

  it('throws ForbiddenError for deactivated user', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'rt-4', user_id: 'u1',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
        role: 'teacher', is_active: false,
      }],
    });
    await expect(
      AuthService.refreshAccessToken('valid-but-deactivated'),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('logout', () => {
  it('revokes the given refresh token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(AuthService.logout('some-token')).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('is_revoked = TRUE'),
      ['some-token'],
    );
  });
});

describe('logoutAll', () => {
  it('revokes all refresh tokens for user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(AuthService.logoutAll('user-id')).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      ['user-id'],
    );
  });
});
