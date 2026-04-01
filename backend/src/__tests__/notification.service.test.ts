// =============================================================
// KJSIS — Notification Service Tests (Phase 2)
// =============================================================

jest.mock('../utils/db', () => ({ query: jest.fn() }));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// Mock Firebase Admin — we test notification logic, not FCM itself
jest.mock('firebase-admin', () => ({
  initializeApp:  jest.fn(),
  credential:     { cert: jest.fn() },
  messaging:      jest.fn(() => ({
    sendEachForMulticast: jest.fn(() => ({
      successCount: 1, failureCount: 0, responses: [{ success: true }],
    })),
  })),
  apps: [],
}));

import { query } from '../utils/db';
import * as NotifService from '../services/notification.service';

const mockQuery = query as jest.Mock;
beforeEach(() => jest.clearAllMocks());

describe('sendNotification', () => {
  it('inserts a DB record and returns silently', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'notif-id' }] })   // INSERT
      .mockResolvedValueOnce({ rows: [] })                      // FCM tokens (none)
      ;

    await expect(
      NotifService.sendNotification({
        userId: 'user-1',
        type: 'marks_submitted',
        title: 'Test',
        message: 'Test message',
      }),
    ).resolves.toBeUndefined();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining(['user-1', 'marks_submitted', 'Test', 'Test message']),
    );
  });
});

describe('markNotificationsRead', () => {
  it('updates is_read for given IDs belonging to user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await NotifService.markNotificationsRead('user-1', ['notif-id-1', 'notif-id-2']);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('is_read = TRUE'),
      expect.arrayContaining(['user-1']),
    );
  });
});

describe('getMyNotifications', () => {
  it('returns paginated notifications with unread count', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'n1', type: 'system', title: 'Hi', is_read: false, created_at: new Date() }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '5', unread: '3' }] });

    const result = await NotifService.getMyNotifications('user-1');

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.unread).toBe(3);
  });
});
