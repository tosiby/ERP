// =============================================================
// KJSIS — Attendance Service
// Core rules enforced here:
//   1. Only class teachers can mark attendance for their division
//   2. Saturdays are holidays by default (can be overridden)
//   3. Sundays are ALWAYS holidays — cannot be overridden
//   4. Only absentees are stored — default is present
//   5. Past dates can be edited (within reasonable range)
//   6. Attendance tied to current academic year
// =============================================================

import { PoolClient } from 'pg';
import { query, withTransaction } from '../utils/db';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  MarkAttendanceInput,
  SaturdayOverrideInput,
  AttendanceQueryInput,
  AttendanceSummaryQueryInput,
} from '../schemas/attendance.schema';
import { AttendanceSummary } from '../types';

// ─── Guard: user must be the class teacher of this division ──
const assertIsClassTeacher = async (
  teacherId: string,
  divisionId: string,
): Promise<void> => {
  const result = await query<{ id: string }>(
    `SELECT ct.id
     FROM class_teachers ct
     JOIN academic_years ay ON ct.academic_year_id = ay.id
     WHERE ct.teacher_id  = $1
       AND ct.division_id = $2
       AND ct.is_active   = TRUE
       AND ay.is_current  = TRUE
     LIMIT 1`,
    [teacherId, divisionId],
  );

  if (!result.rows[0]) {
    throw new ForbiddenError('You are not the class teacher of this division');
  }
};

// ─── Guard: date must be a working day ───────────────────────
const assertIsWorkingDay = async (
  divisionId: string,
  dateStr: string,
): Promise<void> => {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

  // Sunday is ALWAYS a holiday
  if (dayOfWeek === 0) {
    throw new ValidationError('Attendance cannot be marked on Sundays');
  }

  // Saturday: check override table
  if (dayOfWeek === 6) {
    const overrideResult = await query<{ is_working: boolean }>(
      `SELECT is_working
       FROM working_days
       WHERE date = $1
         AND (division_id = $2 OR division_id IS NULL)
       ORDER BY division_id NULLS LAST   -- division-specific overrides win
       LIMIT 1`,
      [dateStr, divisionId],
    );

    const override = overrideResult.rows[0];
    if (!override || !override.is_working) {
      throw new ValidationError(
        `${dateStr} is a Saturday (holiday). Override it as a working day first.`,
      );
    }
  }
};

// =============================================================
// POST: Mark attendance for a date
// Teacher sends only absent student IDs
// =============================================================
export const markAttendance = async (
  input: MarkAttendanceInput,
  teacherId: string,
): Promise<{ marked: number }> => {
  const { division_id, date, absent_student_ids, reasons } = input;

  await assertIsClassTeacher(teacherId, division_id);
  await assertIsWorkingDay(division_id, date);

  // Validate all absent students belong to this division
  if (absent_student_ids.length > 0) {
    const validation = await query<{ id: string }>(
      `SELECT id FROM students
       WHERE id = ANY($1::uuid[])
         AND division_id = $2
         AND is_active = TRUE`,
      [absent_student_ids, division_id],
    );

    if (validation.rows.length !== absent_student_ids.length) {
      throw new ValidationError('One or more students do not belong to this division');
    }
  }

  await withTransaction(async (client: PoolClient) => {
    // Remove all existing absences for this date/division (full replacement)
    await client.query(
      `DELETE FROM attendance WHERE division_id = $1 AND date = $2`,
      [division_id, date],
    );

    // Insert new absentees
    for (const studentId of absent_student_ids) {
      await client.query(
        `INSERT INTO attendance (student_id, division_id, date, reason, marked_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [studentId, division_id, date, reasons?.[studentId] ?? null, teacherId],
      );
    }
  });

  logger.info('Attendance marked', {
    teacherId,
    divisionId: division_id,
    date,
    absentCount: absent_student_ids.length,
  });

  return { marked: absent_student_ids.length };
};

// =============================================================
// GET: Fetch attendance for a date or date range
// =============================================================
export const getAttendance = async (input: AttendanceQueryInput) => {
  const { division_id, date, from_date, to_date, student_id } = input;

  let sql: string;
  let params: unknown[];

  if (date) {
    // Single day — return all students + absent flags
    sql = `
      SELECT
        s.id          AS student_id,
        s.name        AS student_name,
        s.roll_number,
        CASE WHEN a.id IS NOT NULL THEN TRUE ELSE FALSE END AS is_absent,
        a.reason,
        a.marked_by,
        a.created_at  AS marked_at
      FROM students s
      JOIN academic_years ay ON s.academic_year_id = ay.id
      LEFT JOIN attendance a
        ON a.student_id   = s.id
       AND a.date         = $2
       AND a.division_id  = $1
      WHERE s.division_id  = $1
        AND s.is_active    = TRUE
        AND ay.is_current  = TRUE
      ORDER BY s.roll_number`;
    params = [division_id, date];
  } else if (from_date && to_date) {
    // Date range — list all absences
    sql = `
      SELECT
        a.id,
        s.id          AS student_id,
        s.name        AS student_name,
        s.roll_number,
        a.date,
        a.reason,
        a.marked_by,
        a.created_at
      FROM attendance a
      JOIN students s ON a.student_id = s.id
      WHERE a.division_id = $1
        AND a.date BETWEEN $2 AND $3
        ${student_id ? 'AND a.student_id = $4' : ''}
      ORDER BY a.date, s.roll_number`;
    params = [division_id, from_date, to_date, ...(student_id ? [student_id] : [])];
  } else {
    throw new ValidationError('Provide either date or from_date + to_date');
  }

  const result = await query(sql, params);
  return result.rows;
};

// =============================================================
// GET: Attendance summary per student for a date range
// =============================================================
export const getAttendanceSummary = async (
  input: AttendanceSummaryQueryInput,
): Promise<AttendanceSummary[]> => {
  const { division_id, from_date, to_date } = input;

  // Count total working days in range for this division
  const workingDaysResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM generate_series($1::date, $2::date, '1 day'::interval) AS gs(d)
     WHERE EXTRACT(DOW FROM gs.d) NOT IN (0)   -- exclude Sundays
       AND NOT EXISTS (
         SELECT 1 FROM working_days wd
         WHERE wd.date = gs.d::date
           AND (wd.division_id = $3 OR wd.division_id IS NULL)
           AND wd.is_working = FALSE
       )
       AND (
         EXTRACT(DOW FROM gs.d) != 6            -- not Saturday
         OR EXISTS (                             -- OR Saturday overridden as working
           SELECT 1 FROM working_days wd
           WHERE wd.date = gs.d::date
             AND (wd.division_id = $3 OR wd.division_id IS NULL)
             AND wd.is_working = TRUE
         )
       )`,
    [from_date, to_date, division_id],
  );

  const totalWorkingDays = parseInt(workingDaysResult.rows[0]?.count ?? '0');

  // Absence counts per student
  const result = await query<{
    student_id: string;
    student_name: string;
    roll_number: number;
    total_absent: string;
  }>(
    `SELECT
       s.id    AS student_id,
       s.name  AS student_name,
       s.roll_number,
       COUNT(a.id) AS total_absent
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN attendance a
       ON a.student_id  = s.id
      AND a.date BETWEEN $2 AND $3
     WHERE s.division_id  = $1
       AND s.is_active    = TRUE
       AND ay.is_current  = TRUE
     GROUP BY s.id, s.name, s.roll_number
     ORDER BY s.roll_number`,
    [division_id, from_date, to_date],
  );

  return result.rows.map((r) => {
    const absent = parseInt(r.total_absent);
    const present = totalWorkingDays - absent;
    return {
      student_id: r.student_id,
      student_name: r.student_name,
      roll_number: r.roll_number,
      total_working_days: totalWorkingDays,
      total_absent: absent,
      attendance_percentage:
        totalWorkingDays > 0
          ? Math.round((present / totalWorkingDays) * 100 * 10) / 10
          : 0,
    };
  });
};

// =============================================================
// POST: Override Saturday as working/holiday
// =============================================================
export const overrideSaturday = async (
  input: SaturdayOverrideInput,
  createdBy: string,
  role: string,
): Promise<void> => {
  const { division_id, date, is_working, override_reason } = input;

  // If division-specific, only that class teacher (or admin) can do it
  if (division_id && role === 'teacher') {
    await assertIsClassTeacher(createdBy, division_id);
  }

  await query(
    `INSERT INTO working_days (division_id, date, is_working, override_reason, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (division_id, date)
     DO UPDATE SET
       is_working      = EXCLUDED.is_working,
       override_reason = EXCLUDED.override_reason`,
    [division_id ?? null, date, is_working, override_reason ?? null, createdBy],
  );

  logger.info('Saturday override saved', { date, is_working, divisionId: division_id });
};
