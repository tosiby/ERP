// =============================================================
// KJSIS — Admin Service
// Handles: teachers, divisions, exams, subject-exam config,
//          teacher assignments, class teachers, exam locking
// =============================================================

import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { query, withTransaction } from '../utils/db';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  CreateTeacherInput,
  AssignTeacherSubjectInput,
  BulkAssignTeacherInput,
  AssignClassTeacherInput,
  CreateExamInput,
  ConfigureSubjectExamInput,
  AddComponentInput,
  CreateDivisionInput,
} from '../schemas/admin.schema';

// =============================================================
// USERS / TEACHERS
// =============================================================

export const createTeacher = async (input: CreateTeacherInput) => {
  const { name, mobile, password, role } = input;

  // Check mobile uniqueness
  const existing = await query<{ id: string }>(
    `SELECT id FROM users WHERE mobile = $1 LIMIT 1`,
    [mobile],
  );
  if (existing.rows[0]) {
    throw new ConflictError(`A user with mobile ${mobile} already exists`);
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '12');
  const password_hash = await bcrypt.hash(password, rounds);

  const result = await query<{ id: string; name: string; role: string }>(
    `INSERT INTO users (name, mobile, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, role`,
    [name, mobile, password_hash, role],
  );

  logger.info('Teacher created', { id: result.rows[0].id, role });
  return result.rows[0];
};

export const getAllTeachers = async () => {
  const result = await query(
    `SELECT id, name, mobile, role, is_active, created_at
     FROM users
     WHERE role IN ('teacher', 'exam_cell', 'vp', 'principal')
     ORDER BY name`,
  );
  return result.rows;
};

export const toggleUserActive = async (userId: string, isActive: boolean) => {
  const result = await query<{ id: string; is_active: boolean }>(
    `UPDATE users SET is_active = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, is_active`,
    [userId, isActive],
  );
  if (!result.rows[0]) throw new NotFoundError('User');
  return result.rows[0];
};

// =============================================================
// DIVISIONS
// =============================================================

export const createDivision = async (input: CreateDivisionInput) => {
  const { class_id, name } = input;

  // Verify class exists
  const classExists = await query<{ id: string }>(
    `SELECT id FROM classes WHERE id = $1 AND is_active = TRUE`,
    [class_id],
  );
  if (!classExists.rows[0]) throw new NotFoundError('Class');

  const result = await query<{ id: string; name: string; class_id: string }>(
    `INSERT INTO divisions (class_id, name)
     VALUES ($1, $2)
     ON CONFLICT (class_id, name) DO NOTHING
     RETURNING id, name, class_id`,
    [class_id, name],
  );

  if (!result.rows[0]) {
    throw new ConflictError(`Division ${name} already exists in this class`);
  }

  return result.rows[0];
};

export const getDivisionsByClass = async (classId: string) => {
  const result = await query(
    `SELECT d.id, d.name, d.is_active, c.name AS class_name
     FROM divisions d
     JOIN classes c ON d.class_id = c.id
     WHERE d.class_id = $1
     ORDER BY d.name`,
    [classId],
  );
  return result.rows;
};

// =============================================================
// EXAMS
// =============================================================

export const createExam = async (input: CreateExamInput) => {
  const { name, label, academic_year_id, start_date, end_date } = input;

  const result = await query<{ id: string; name: string }>(
    `INSERT INTO exams (name, label, academic_year_id, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name`,
    [name, label ?? null, academic_year_id, start_date ?? null, end_date ?? null],
  );

  logger.info('Exam created', { id: result.rows[0].id, name });
  return result.rows[0];
};

export const getExamsByYear = async (academicYearId?: string) => {
  const yearFilter = academicYearId
    ? `WHERE e.academic_year_id = $1`
    : `WHERE ay.is_current = TRUE`;

  const result = await query(
    `SELECT e.id, e.name, e.label, e.start_date, e.end_date, e.is_locked, e.is_active,
            ay.label AS academic_year
     FROM exams e
     JOIN academic_years ay ON e.academic_year_id = ay.id
     ${yearFilter}
     ORDER BY e.start_date NULLS LAST`,
    academicYearId ? [academicYearId] : [],
  );

  return result.rows;
};

export const lockExam = async (examId: string, lockedBy: string) => {
  const result = await query<{ id: string; is_locked: boolean }>(
    `UPDATE exams SET is_locked = TRUE WHERE id = $1 RETURNING id, is_locked`,
    [examId],
  );
  if (!result.rows[0]) throw new NotFoundError('Exam');
  logger.info('Exam locked', { examId, lockedBy });
  return result.rows[0];
};

// =============================================================
// SUBJECT-EXAM CONFIG
// =============================================================

export const configureSubjectExam = async (input: ConfigureSubjectExamInput) => {
  const { subject_id, exam_id, total_marks, passing_marks, entry_mode } = input;

  if (passing_marks >= total_marks) {
    throw new ValidationError('Passing marks must be less than total marks');
  }

  const result = await query<{ id: string }>(
    `INSERT INTO subject_exam_config
       (subject_id, exam_id, total_marks, passing_marks, entry_mode)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subject_id, exam_id)
     DO UPDATE SET
       total_marks   = EXCLUDED.total_marks,
       passing_marks = EXCLUDED.passing_marks,
       entry_mode    = EXCLUDED.entry_mode
     RETURNING id`,
    [subject_id, exam_id, total_marks, passing_marks, entry_mode],
  );

  return result.rows[0];
};

export const getSubjectExamConfigs = async (examId: string) => {
  const result = await query(
    `SELECT
       sec.id, sec.total_marks, sec.passing_marks, sec.entry_mode,
       s.id   AS subject_id,
       s.name AS subject_name,
       s.code AS subject_code,
       c.name AS class_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id', comp.id,
             'component_type', comp.component_type,
             'max_marks', comp.max_marks,
             'display_order', comp.display_order
           ) ORDER BY comp.display_order
         ) FILTER (WHERE comp.id IS NOT NULL),
         '[]'
       ) AS components
     FROM subject_exam_config sec
     JOIN subjects s ON sec.subject_id = s.id
     JOIN classes  c ON s.class_id     = c.id
     LEFT JOIN components comp ON comp.subject_exam_config_id = sec.id AND comp.is_active = TRUE
     WHERE sec.exam_id   = $1
       AND sec.is_active = TRUE
     GROUP BY sec.id, s.id, c.name
     ORDER BY c.grade_number, s.display_order`,
    [examId],
  );
  return result.rows;
};

// =============================================================
// COMPONENTS
// =============================================================

export const addComponent = async (input: AddComponentInput) => {
  const { subject_exam_config_id, component_type, max_marks, display_order } = input;

  // Verify config exists and uses component mode
  const config = await query<{ entry_mode: string }>(
    `SELECT entry_mode FROM subject_exam_config WHERE id = $1`,
    [subject_exam_config_id],
  );
  if (!config.rows[0]) throw new NotFoundError('Subject-exam config');
  if (config.rows[0].entry_mode !== 'component') {
    throw new ValidationError('This subject-exam config uses total mode, not component mode');
  }

  const result = await query<{ id: string }>(
    `INSERT INTO components
       (subject_exam_config_id, component_type, max_marks, display_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (subject_exam_config_id, component_type)
     DO UPDATE SET max_marks = EXCLUDED.max_marks, display_order = EXCLUDED.display_order
     RETURNING id`,
    [subject_exam_config_id, component_type, max_marks, display_order],
  );

  return result.rows[0];
};

// =============================================================
// TEACHER-SUBJECT ASSIGNMENT
// =============================================================

export const assignTeacherSubject = async (input: AssignTeacherSubjectInput) => {
  const { teacher_id, division_id, subject_id, academic_year_id } = input;

  // Validate teacher exists + is teacher role
  const teacher = await query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE id = $1 AND is_active = TRUE`,
    [teacher_id],
  );
  if (!teacher.rows[0]) throw new NotFoundError('Teacher');
  if (!['teacher', 'exam_cell', 'super_admin'].includes(teacher.rows[0].role)) {
    throw new ValidationError('User is not a teacher');
  }

  // Validate subject belongs to correct class for this division
  const subjectCheck = await query<{ id: string }>(
    `SELECT s.id FROM subjects s
     JOIN classes c ON s.class_id = c.id
     JOIN divisions d ON d.class_id = c.id
     WHERE s.id = $1 AND d.id = $2 AND s.is_active = TRUE`,
    [subject_id, division_id],
  );
  if (!subjectCheck.rows[0]) {
    throw new ValidationError('Subject does not belong to the class of this division');
  }

  const result = await query<{ id: string }>(
    `INSERT INTO teacher_subject_map
       (teacher_id, division_id, subject_id, academic_year_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (teacher_id, division_id, subject_id, academic_year_id)
     DO UPDATE SET is_active = TRUE
     RETURNING id`,
    [teacher_id, division_id, subject_id, academic_year_id],
  );

  logger.info('Teacher assigned to subject', { teacher_id, division_id, subject_id });
  return result.rows[0];
};

export const bulkAssignTeacherSubject = async (input: BulkAssignTeacherInput) => {
  const { assignments } = input;

  await withTransaction(async (client: PoolClient) => {
    for (const assignment of assignments) {
      await client.query(
        `INSERT INTO teacher_subject_map
           (teacher_id, division_id, subject_id, academic_year_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (teacher_id, division_id, subject_id, academic_year_id)
         DO UPDATE SET is_active = TRUE`,
        [
          assignment.teacher_id,
          assignment.division_id,
          assignment.subject_id,
          assignment.academic_year_id,
        ],
      );
    }
  });

  logger.info('Bulk teacher assignments done', { count: assignments.length });
  return { assigned: assignments.length };
};

// =============================================================
// CLASS TEACHERS
// =============================================================

export const assignClassTeacher = async (input: AssignClassTeacherInput) => {
  const { teacher_id, division_id, academic_year_id } = input;

  const result = await query<{ id: string }>(
    `INSERT INTO class_teachers (teacher_id, division_id, academic_year_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (division_id, academic_year_id)
     DO UPDATE SET teacher_id = EXCLUDED.teacher_id, is_active = TRUE
     RETURNING id`,
    [teacher_id, division_id, academic_year_id],
  );

  logger.info('Class teacher assigned', { teacher_id, division_id });
  return result.rows[0];
};

export const getClassTeachers = async (academicYearId?: string) => {
  const filter = academicYearId
    ? `AND ct.academic_year_id = '${academicYearId}'`
    : `AND ay.is_current = TRUE`;

  const result = await query(
    `SELECT
       ct.id,
       u.name     AS teacher_name,
       u.mobile,
       d.name     AS division_name,
       c.name     AS class_name,
       c.grade_number
     FROM class_teachers ct
     JOIN users         u  ON ct.teacher_id       = u.id
     JOIN divisions     d  ON ct.division_id       = d.id
     JOIN classes       c  ON d.class_id           = c.id
     JOIN academic_years ay ON ct.academic_year_id = ay.id
     WHERE ct.is_active = TRUE ${filter}
     ORDER BY c.grade_number, d.name`,
  );

  return result.rows;
};

// =============================================================
// SUBJECTS (read + add custom)
// =============================================================

export const getSubjectsByClass = async (classId: string) => {
  const result = await query(
    `SELECT id, name, code, subject_type, is_elective, elective_group, display_order, is_active
     FROM subjects
     WHERE class_id = $1
     ORDER BY display_order`,
    [classId],
  );
  return result.rows;
};

export const getAllClasses = async () => {
  const result = await query(
    `SELECT id, grade_number, name, is_active FROM classes ORDER BY grade_number`,
  );
  return result.rows;
};
