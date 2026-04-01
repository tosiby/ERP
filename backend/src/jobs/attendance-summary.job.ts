// =============================================================
// KJSIS — Cron Job: Daily Attendance Summary
// Runs: every day at 6:00 PM school time
// Action: detect students with attendance < 75% and notify class teachers
// =============================================================

import { query } from '../utils/db';
import { logger } from '../utils/logger';
import { notifyAttendanceAlert } from '../services/notification.service';
import { auditLog } from '../services/audit.service';

const ATTENDANCE_THRESHOLD = parseFloat(process.env.AI_ATTEND_THRESHOLD ?? '75');

export const runAttendanceSummaryJob = async (): Promise<void> => {
  logger.info('[JOB] Attendance summary starting...');

  try {
    // Get all active divisions with a class teacher
    const divisions = await query<{
      division_id: string;
      division_name: string;
      class_teacher_id: string;
    }>(
      `SELECT
         d.id   AS division_id,
         d.name AS division_name,
         ct.teacher_id AS class_teacher_id
       FROM class_teachers ct
       JOIN divisions d ON ct.division_id = d.id
       JOIN academic_years ay ON ct.academic_year_id = ay.id
       WHERE ay.is_current = TRUE AND ct.is_active = TRUE AND d.is_active = TRUE`,
    );

    let alertsSent = 0;

    for (const div of divisions.rows) {
      // Calculate attendance per student in this division
      const result = await query<{
        student_id: string;
        student_name: string;
        total_absent: string;
        days_elapsed: string;
      }>(
        `SELECT
           s.id    AS student_id,
           s.name  AS student_name,
           COUNT(a.id) AS total_absent,
           GREATEST(
             (CURRENT_DATE - ay.start_date) * 5 / 7, 1
           ) AS days_elapsed
         FROM students s
         JOIN academic_years ay ON s.academic_year_id = ay.id
         LEFT JOIN attendance a ON a.student_id = s.id
         WHERE s.division_id = $1
           AND s.is_active   = TRUE
           AND ay.is_current = TRUE
         GROUP BY s.id, s.name, ay.start_date`,
        [div.division_id],
      );

      for (const student of result.rows) {
        const absent   = parseInt(student.total_absent);
        const elapsed  = parseInt(student.days_elapsed);
        const pct      = Math.round(((elapsed - absent) / elapsed) * 100 * 10) / 10;

        if (pct < ATTENDANCE_THRESHOLD) {
          await notifyAttendanceAlert({
            classTeacherId: div.class_teacher_id,
            studentName:    student.student_name,
            attendancePct:  pct,
            divisionName:   div.division_name,
          });
          alertsSent++;
        }
      }
    }

    auditLog({
      userId: null,
      action: 'create',
      entityType: 'job:attendance_summary',
      metadata: { alertsSent, timestamp: new Date().toISOString() },
    });

    logger.info(`[JOB] Attendance summary complete — ${alertsSent} alerts sent`);
  } catch (err) {
    logger.error('[JOB] Attendance summary failed', { err });
  }
};
