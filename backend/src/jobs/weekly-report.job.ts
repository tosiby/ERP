// =============================================================
// KJSIS — Cron Job: Weekly Performance Report
// Runs: every Monday at 7:00 AM
// Action: generates summary and notifies VP/Principal
// =============================================================

import { query } from '../utils/db';
import { logger } from '../utils/logger';
import { broadcastNotification } from '../services/notification.service';
import { auditLog } from '../services/audit.service';

export const runWeeklyReportJob = async (): Promise<void> => {
  logger.info('[JOB] Weekly performance report starting...');

  try {
    // Get previous week's attendance stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const todayStr     = new Date().toISOString().split('T')[0];

    const statsResult = await query<{
      total_students: string;
      total_absences: string;
      avg_attendance_pct: string;
    }>(
      `SELECT
         COUNT(DISTINCT s.id)   AS total_students,
         COUNT(a.id)            AS total_absences,
         ROUND(
           (1 - COUNT(a.id)::numeric / NULLIF(COUNT(DISTINCT s.id) * 5, 0)) * 100, 1
         ) AS avg_attendance_pct
       FROM students s
       JOIN academic_years ay ON s.academic_year_id = ay.id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.date BETWEEN $1 AND $2
       WHERE s.is_active = TRUE AND ay.is_current = TRUE`,
      [weekStartStr, todayStr],
    );

    const stats = statsResult.rows[0];

    // Notify VP + Principal
    const leaders = await query<{ id: string }>(
      `SELECT id FROM users WHERE role IN ('vp', 'principal', 'super_admin') AND is_active = TRUE`,
    );

    await broadcastNotification({
      userIds: leaders.rows.map((u) => u.id),
      type:    'system',
      title:   '📊 Weekly School Performance Report Ready',
      message: `Week of ${weekStartStr}: ${stats.total_students} students tracked, ${stats.total_absences} total absences, ${stats.avg_attendance_pct}% avg attendance. View full report in the app.`,
      metadata: {
        week_start:         weekStartStr,
        week_end:           todayStr,
        total_students:     stats.total_students,
        total_absences:     stats.total_absences,
        avg_attendance_pct: stats.avg_attendance_pct,
      },
    });

    auditLog({
      userId: null,
      action: 'create',
      entityType: 'job:weekly_report',
      metadata: { weekStart: weekStartStr, weekEnd: todayStr },
    });

    logger.info('[JOB] Weekly report complete');
  } catch (err) {
    logger.error('[JOB] Weekly report failed', { err });
  }
};
