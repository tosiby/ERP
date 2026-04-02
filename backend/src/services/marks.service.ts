// =============================================================
// KJSIS — Marks Service
// Core rules enforced here:
//   1. Teacher can only enter marks for their assigned subjects
//   2. Marks can only be modified while status is 'draft'
//   3. Submitted marks can only be locked by exam_cell/super_admin
//   4. Locked marks are immutable
//   5. Each mark is one row: student × subject × exam × component
// =============================================================

import { PoolClient } from 'pg';
import { query, withTransaction } from '../utils/db';
import {
  ForbiddenError,
  NotFoundError,
  ExamLockedError,
  ValidationError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { UserRole, EntryMode } from '../types';
import {
  BulkMarkEntryInput,
  BulkComponentMarkEntryInput,
  SubmitMarksInput,
  LockSubjectMarksInput,
  MarksQueryInput,
} from '../schemas/marks.schema';

// ─── Guard: teacher must own the subject assignment ──────────
const assertTeacherOwnsSubject = async (
  teacherId: string,
  divisionId: string,
  subjectId: string,
): Promise<void> => {
  const result = await query<{ id: string }>(
    `SELECT tsm.id
     FROM teacher_subject_map tsm
     JOIN academic_years ay ON tsm.academic_year_id = ay.id
     WHERE tsm.teacher_id  = $1
       AND tsm.division_id = $2
       AND tsm.subject_id  = $3
       AND tsm.is_active   = TRUE
       AND ay.is_current   = TRUE
     LIMIT 1`,
    [teacherId, divisionId, subjectId],
  );

  if (!result.rows[0]) {
    throw new ForbiddenError('You are not assigned to this subject in this division');
  }
};

// ─── Guard: exam must not be locked ──────────────────────────
const assertExamNotLocked = async (examId: string): Promise<void> => {
  const result = await query<{ is_locked: boolean }>(
    `SELECT is_locked FROM exams WHERE id = $1`,
    [examId],
  );
  const exam = result.rows[0];
  if (!exam) throw new NotFoundError('Exam');
  if (exam.is_locked) throw new ExamLockedError();
};

// ─── Fetch subject-exam config ────────────────────────────────
const getSubjectExamConfig = async (subjectId: string, examId: string) => {
  const result = await query<{
    id: string;
    entry_mode: EntryMode;
    total_marks: number;
    passing_marks: number;
  }>(
    `SELECT id, entry_mode, total_marks, passing_marks
     FROM subject_exam_config
     WHERE subject_id = $1 AND exam_id = $2 AND is_active = TRUE
     LIMIT 1`,
    [subjectId, examId],
  );

  const config = result.rows[0];
  if (!config) {
    throw new NotFoundError('Subject-exam configuration. Please contact exam cell.');
  }
  return config;
};

// ─── Fetch active students for a division ────────────────────
const getDivisionStudentIds = async (divisionId: string): Promise<Set<string>> => {
  const result = await query<{ id: string }>(
    `SELECT s.id
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE s.division_id = $1
       AND s.is_active   = TRUE
       AND ay.is_current = TRUE`,
    [divisionId],
  );
  return new Set(result.rows.map((r) => r.id));
};

// =============================================================
// GET: Fetch marks sheet for a subject × exam × division
// =============================================================
export const getMarksSheet = async (
  input: MarksQueryInput,
  requesterId: string,
  requesterRole: UserRole,
) => {
  const { exam_id, subject_id, division_id } = input;

  // Teachers can only view their own assigned subjects
  if (requesterRole === 'teacher') {
    await assertTeacherOwnsSubject(requesterId, division_id, subject_id);
  }

  const config = await getSubjectExamConfig(subject_id, exam_id);

  // Fetch students with their marks (LEFT JOIN — shows absent/unrecorded too)
  const result = await query(
    `SELECT
       s.id              AS student_id,
       s.name            AS student_name,
       s.roll_number,
       m.id              AS mark_id,
       m.marks_obtained,
       m.is_absent,
       m.status,
       m.component_id,
       comp.component_type
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN marks m
       ON m.student_id = s.id
      AND m.subject_id = $2
      AND m.exam_id    = $1
     LEFT JOIN components comp ON m.component_id = comp.id
     WHERE s.division_id  = $3
       AND s.is_active     = TRUE
       AND ay.is_current   = TRUE
     ORDER BY s.roll_number`,
    [exam_id, subject_id, division_id],
  );

  return {
    config,
    students: result.rows,
  };
};

// =============================================================
// POST: Bulk save marks (total-mode) — creates or updates drafts
// =============================================================
export const saveMarksTotal = async (
  input: BulkMarkEntryInput,
  teacherId: string,
  role: UserRole,
): Promise<void> => {
  const { exam_id, subject_id, division_id, marks } = input;

  // Enforce ownership for teachers
  if (role === 'teacher') {
    await assertTeacherOwnsSubject(teacherId, division_id, subject_id);
  }

  await assertExamNotLocked(exam_id);

  const config = await getSubjectExamConfig(subject_id, exam_id);

  if (config.entry_mode !== 'total') {
    throw new ValidationError(
      'This subject uses component-based entry. Use the component endpoint.',
    );
  }

  const validStudentIds = await getDivisionStudentIds(division_id);

  // Validate each row
  for (const row of marks) {
    if (!validStudentIds.has(row.student_id)) {
      throw new ValidationError(`Student ${row.student_id} is not in this division`);
    }
    if (!row.is_absent && row.marks_obtained > config.total_marks) {
      throw new ValidationError(
        `Marks ${row.marks_obtained} exceeds total ${config.total_marks} for student ${row.student_id}`,
      );
    }
  }

  await withTransaction(async (client: PoolClient) => {
    for (const row of marks) {
      await client.query(
        `INSERT INTO marks
           (student_id, subject_id, exam_id, component_id, teacher_id,
            marks_obtained, is_absent, status)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, 'draft')
         ON CONFLICT (student_id, subject_id, exam_id, component_id)
         DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           is_absent      = EXCLUDED.is_absent,
           teacher_id     = EXCLUDED.teacher_id,
           status         = CASE
             WHEN marks.status = 'locked' THEN marks.status
             ELSE 'draft'
           END,
           updated_at = NOW()
         WHERE marks.status != 'locked'`,
        [
          row.student_id,
          subject_id,
          exam_id,
          teacherId,
          row.is_absent ? 0 : row.marks_obtained,
          row.is_absent ?? false,
        ],
      );
    }
  });

  logger.info('Marks saved (total mode)', {
    teacherId,
    subjectId: subject_id,
    examId: exam_id,
    count: marks.length,
  });
};

// =============================================================
// POST: Bulk save marks (component-mode)
// =============================================================
export const saveMarksComponent = async (
  input: BulkComponentMarkEntryInput,
  teacherId: string,
  role: UserRole,
): Promise<void> => {
  const { exam_id, subject_id, division_id, marks } = input;

  if (role === 'teacher') {
    await assertTeacherOwnsSubject(teacherId, division_id, subject_id);
  }

  await assertExamNotLocked(exam_id);

  const config = await getSubjectExamConfig(subject_id, exam_id);

  if (config.entry_mode !== 'component') {
    throw new ValidationError(
      'This subject uses total-based entry. Use the total entry endpoint.',
    );
  }

  // Fetch valid components for this config
  const compResult = await query<{ id: string; max_marks: number; component_type: string }>(
    `SELECT id, max_marks, component_type
     FROM components
     WHERE subject_exam_config_id = $1 AND is_active = TRUE`,
    [config.id],
  );
  const componentMap = new Map(compResult.rows.map((c) => [c.id, c]));

  const validStudentIds = await getDivisionStudentIds(division_id);

  for (const row of marks) {
    if (!validStudentIds.has(row.student_id)) {
      throw new ValidationError(`Student ${row.student_id} is not in this division`);
    }
    const comp = componentMap.get(row.component_id);
    if (!comp) {
      throw new ValidationError(`Component ${row.component_id} is not valid for this subject/exam`);
    }
    if (!row.is_absent && row.marks_obtained > comp.max_marks) {
      throw new ValidationError(
        `Marks ${row.marks_obtained} exceeds ${comp.component_type} max ${comp.max_marks}`,
      );
    }
  }

  await withTransaction(async (client: PoolClient) => {
    for (const row of marks) {
      await client.query(
        `INSERT INTO marks
           (student_id, subject_id, exam_id, component_id, teacher_id,
            marks_obtained, is_absent, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
         ON CONFLICT (student_id, subject_id, exam_id, component_id)
         DO UPDATE SET
           marks_obtained = EXCLUDED.marks_obtained,
           is_absent      = EXCLUDED.is_absent,
           teacher_id     = EXCLUDED.teacher_id,
           status         = CASE
             WHEN marks.status = 'locked' THEN marks.status
             ELSE 'draft'
           END,
           updated_at = NOW()
         WHERE marks.status != 'locked'`,
        [
          row.student_id,
          subject_id,
          exam_id,
          row.component_id,
          teacherId,
          row.is_absent ? 0 : row.marks_obtained,
          row.is_absent ?? false,
        ],
      );
    }
  });

  logger.info('Marks saved (component mode)', {
    teacherId,
    subjectId: subject_id,
    examId: exam_id,
    count: marks.length,
  });
};

// =============================================================
// POST: Submit marks — draft → submitted
// =============================================================
export const submitMarks = async (
  input: SubmitMarksInput,
  teacherId: string,
  role: UserRole,
): Promise<{ updated: number }> => {
  const { exam_id, subject_id, division_id } = input;

  if (role === 'teacher') {
    await assertTeacherOwnsSubject(teacherId, division_id, subject_id);
  }

  await assertExamNotLocked(exam_id);

  // Only submit marks that belong to students in this division
  const result = await query<{ count: string }>(
    `UPDATE marks m
     SET status       = 'submitted',
         submitted_at = NOW(),
         updated_at   = NOW()
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE m.student_id = s.id
       AND s.division_id = $3
       AND ay.is_current = TRUE
       AND m.subject_id  = $2
       AND m.exam_id     = $1
       AND m.status      = 'draft'`,
    [exam_id, subject_id, division_id],
  );

  const updated = result.rowCount ?? 0;

  logger.info('Marks submitted', {
    teacherId,
    subjectId: subject_id,
    examId: exam_id,
    updatedRows: updated,
  });

  return { updated };
};

// =============================================================
// POST: Lock marks — submitted → locked (exam_cell / super_admin only)
// =============================================================
export const lockMarks = async (
  input: LockSubjectMarksInput,
  lockedBy: string,
): Promise<{ locked: number }> => {
  const { exam_id, subject_id, division_id } = input;

  const result = await query<{ count: string }>(
    `UPDATE marks m
     SET status    = 'locked',
         locked_at = NOW(),
         updated_at = NOW()
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE m.student_id = s.id
       AND s.is_active   = TRUE
       AND ay.is_current = TRUE
       AND m.exam_id     = $1
       ${subject_id ? 'AND m.subject_id = $2' : ''}
       ${division_id ? `AND s.division_id = $${subject_id ? 3 : 2}` : ''}
       AND m.status      = 'submitted'`,
    [
      exam_id,
      ...(subject_id ? [subject_id] : []),
      ...(division_id ? [division_id] : []),
    ],
  );

  const locked = result.rowCount ?? 0;

  logger.info('Marks locked', { lockedBy, examId: exam_id, lockedRows: locked });

  return { locked };
};

// =============================================================
// GET: Mark entry status for exam cell dashboard
// =============================================================
export const getMarkEntryStatus = async (examId: string) => {
  const result = await query(
    `SELECT
       c.name          AS class_name,
       d.name          AS division_name,
       s.name          AS subject_name,
       COUNT(m.id)     AS total_entries,
       COUNT(m.id) FILTER (WHERE m.status = 'draft')      AS draft_count,
       COUNT(m.id) FILTER (WHERE m.status = 'submitted')  AS submitted_count,
       COUNT(m.id) FILTER (WHERE m.status = 'locked')     AS locked_count
     FROM teacher_subject_map tsm
     JOIN subjects  s ON tsm.subject_id  = s.id
     JOIN divisions d ON tsm.division_id = d.id
     JOIN classes   c ON d.class_id      = c.id
     JOIN academic_years ay ON tsm.academic_year_id = ay.id
     LEFT JOIN marks m
       ON m.subject_id  = tsm.subject_id
      AND m.exam_id     = $1
      AND m.teacher_id  = tsm.teacher_id
     WHERE ay.is_current = TRUE
       AND tsm.is_active = TRUE
     GROUP BY c.name, d.name, s.name, c.grade_number, d.name
     ORDER BY c.grade_number, d.name, s.display_order`,
    [examId],
  );

  return result.rows;
};
