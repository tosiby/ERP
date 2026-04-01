// =============================================================
// KJSIS — Notification Service
// Dual-channel: DB (persistent) + FCM (push, best-effort)
// FCM failures are logged, never thrown — DB record always saved.
// =============================================================

import * as admin from 'firebase-admin';
import { query } from '../utils/db';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────
type NotificationType =
  | 'marks_submitted'
  | 'marks_locked'
  | 'attendance_alert'
  | 'at_risk_alert'
  | 'system';

interface SendNotificationOptions {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface BroadcastOptions {
  userIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ─── Firebase init (lazy, only if credentials present) ────────
let firebaseApp: admin.app.App | null = null;

const getFirebaseApp = (): admin.app.App | null => {
  if (firebaseApp) return firebaseApp;

  const credentialPath = process.env.FIREBASE_CREDENTIAL_PATH;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!credentialPath || !projectId) {
    logger.warn('Firebase not configured — push notifications disabled');
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(credentialPath);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
    logger.info('Firebase Admin initialised');
    return firebaseApp;
  } catch (err) {
    logger.error('Firebase init failed', { err });
    return null;
  }
};

// ─── Get all FCM tokens for a user ───────────────────────────
const getUserFcmTokens = async (userId: string): Promise<string[]> => {
  const result = await query<{ fcm_token: string }>(
    `SELECT fcm_token FROM fcm_tokens WHERE user_id = $1`,
    [userId],
  );
  return result.rows.map((r) => r.fcm_token);
};

// ─── Send FCM to device tokens (best-effort) ──────────────────
const sendFcmPush = async (
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> => {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) return false;

  try {
    const messaging = admin.messaging(app);
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    // Clean up invalid tokens
    const invalidTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (
          errCode === 'messaging/invalid-registration-token' ||
          errCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await query(
        `DELETE FROM fcm_tokens WHERE fcm_token = ANY($1::text[])`,
        [invalidTokens],
      ).catch((e) => logger.warn('Failed to clean invalid FCM tokens', { e }));
    }

    logger.debug('FCM sent', {
      total: tokens.length,
      success: response.successCount,
      failed: response.failureCount,
    });

    return response.successCount > 0;
  } catch (err) {
    logger.error('FCM send error (non-fatal)', { err });
    return false;
  }
};

// =============================================================
// PUBLIC: Send notification to one user
// =============================================================
export const sendNotification = async (opts: SendNotificationOptions): Promise<void> => {
  const { userId, type, title, message, metadata } = opts;

  // 1. Save to DB (always)
  const dbResult = await query<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, type, title, message, metadata ? JSON.stringify(metadata) : null],
  );
  const notifId = dbResult.rows[0]?.id;

  // 2. Send FCM (best-effort)
  const tokens = await getUserFcmTokens(userId);
  const sent = await sendFcmPush(tokens, title, message, {
    notification_id: notifId ?? '',
    type,
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
  });

  // 3. Update FCM status in DB
  if (notifId && tokens.length > 0) {
    await query(
      `UPDATE notifications SET sent_via_fcm = $1 WHERE id = $2`,
      [sent, notifId],
    ).catch(() => {/* non-critical */});
  }
};

// =============================================================
// PUBLIC: Broadcast to multiple users
// =============================================================
export const broadcastNotification = async (opts: BroadcastOptions): Promise<void> => {
  await Promise.allSettled(
    opts.userIds.map((userId) =>
      sendNotification({ ...opts, userId }),
    ),
  );
};

// =============================================================
// PUBLIC: Notify exam_cell + super_admin when marks submitted
// =============================================================
export const notifyMarksSubmitted = async (payload: {
  teacherName: string;
  subjectName: string;
  className: string;
  divisionName: string;
  examName: string;
  marksCount: number;
}): Promise<void> => {
  // Get all exam cell users
  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('exam_cell', 'super_admin') AND is_active = TRUE`,
  );

  await broadcastNotification({
    userIds: admins.rows.map((u) => u.id),
    type: 'marks_submitted',
    title: '📝 Marks Submitted',
    message: `${payload.teacherName} submitted ${payload.marksCount} marks for ${payload.subjectName} — ${payload.className} ${payload.divisionName} (${payload.examName})`,
    metadata: payload,
  });
};

// =============================================================
// PUBLIC: Notify teacher when marks are locked
// =============================================================
export const notifyMarksLocked = async (payload: {
  teacherId: string;
  subjectName: string;
  examName: string;
}): Promise<void> => {
  await sendNotification({
    userId: payload.teacherId,
    type: 'marks_locked',
    title: '🔒 Marks Locked',
    message: `Your marks for ${payload.subjectName} (${payload.examName}) have been locked by the exam cell.`,
    metadata: payload,
  });
};

// =============================================================
// PUBLIC: Attendance alert (< threshold %)
// =============================================================
export const notifyAttendanceAlert = async (payload: {
  classTeacherId: string;
  studentName: string;
  attendancePct: number;
  divisionName: string;
}): Promise<void> => {
  await sendNotification({
    userId: payload.classTeacherId,
    type: 'attendance_alert',
    title: '⚠️ Low Attendance Alert',
    message: `${payload.studentName} (${payload.divisionName}) has attendance ${payload.attendancePct}% — below the 75% threshold.`,
    metadata: payload,
  });
};

// =============================================================
// QUERIES: Notification inbox
// =============================================================
export const getMyNotifications = async (
  userId: string,
  onlyUnread = false,
  page = 1,
  limit = 20,
) => {
  const offset = (page - 1) * limit;
  const unreadFilter = onlyUnread ? `AND is_read = FALSE` : '';

  const [items, countRes] = await Promise.all([
    query(
      `SELECT id, type, title, message, is_read, metadata, created_at, read_at
       FROM notifications
       WHERE user_id = $1 ${unreadFilter}
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    query<{ count: string; unread: string }>(
      `SELECT
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE is_read = FALSE) AS unread
       FROM notifications WHERE user_id = $1`,
      [userId],
    ),
  ]);

  return {
    items: items.rows,
    total: parseInt(countRes.rows[0]?.count ?? '0'),
    unread: parseInt(countRes.rows[0]?.unread ?? '0'),
    page,
    limit,
  };
};

export const markNotificationsRead = async (
  userId: string,
  notificationIds: string[],
): Promise<void> => {
  await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND is_read = FALSE`,
    [userId, notificationIds],
  );
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
};
