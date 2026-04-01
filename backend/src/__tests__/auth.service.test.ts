// =============================================================
// KJSIS — Auth Service Tests
// =============================================================

import { UnauthorizedError, ForbiddenError, ValidationError } from '../utils/errors';

jest.mock('../utils/db', () => ({ query: jest.fn() }));
jest.mock('../utils/jwt', () => ({
  signToken: jest.fn(() => 'mock-token'),
  verifyToken: jest.fn(),
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(() => 'hashed-password'),
}));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { query } from '../utils/db';
import bcrypt from 'bcryptjs';
import * as AuthService from '../services/auth.service';

const mockQuery = query as jest.Mock;
const mockCompare = bcrypt.compare as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('login', () => {
  it('throws UnauthorizedError when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      AuthService.login({ mobile: '9999999999', password: 'pass' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws ForbiddenError when user is deactivated', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', mobile: '9999999999', is_active: false, password_hash: 'hash', role: 'teacher' }],
    });

    await expect(
      AuthService.login({ mobile: '9999999999', password: 'pass' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws UnauthorizedError when password does not match', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', mobile: '9999999999', is_active: true, password_hash: 'hash', role: 'teacher' }],
    });
    mockCompare.mockResolvedValueOnce(false);

    await expect(
      AuthService.login({ mobile: '9999999999', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('returns token and user on success', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'u1', name: 'John', mobile: '9999999999',
        is_active: true, password_hash: 'hash', role: 'teacher',
        created_at: new Date(), updated_at: new Date(),
      }],
    });
    mockCompare.mockResolvedValueOnce(true);

    const result = await AuthService.login({ mobile: '9999999999', password: 'correct' });

    expect(result.token).toBe('mock-token');
    expect(result.user.id).toBe('u1');
    expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
  });
});

describe('changePassword', () => {
  it('throws ValidationError when current password is wrong', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', password_hash: 'oldhash' }],
    });
    mockCompare.mockResolvedValueOnce(false);

    await expect(
      AuthService.changePassword('u1', {
        current_password: 'wrong',
        new_password: 'NewPass123',
        confirm_password: 'NewPass123',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('updates password successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'u1', password_hash: 'oldhash' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE
    mockCompare.mockResolvedValueOnce(true);

    await expect(
      AuthService.changePassword('u1', {
        current_password: 'correct',
        new_password: 'NewPass123',
        confirm_password: 'NewPass123',
      }),
    ).resolves.toBeUndefined();
  });
});
