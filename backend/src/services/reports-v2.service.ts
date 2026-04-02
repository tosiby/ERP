// =============================================================
// KJSIS — Phase 4: Reports V2 Service
// Dynamic progress card + consolidated report assembly
// =============================================================

import { pool } from '../utils/db';
import {
  ProgressCardData,
  ProgressCardExamColumn,
  ProgressCardSubjectRow,
  ProgressCardMarkCell,
  ProgressCardTotals,
  ConsolidatedReport,
  ConsolidatedStudentRow,
  ConsolidatedReportSubjectHeader,
  ReportSettings,
} from '../types';

// ─── Grade Boundaries ─────────────────────────────────────────
const GRADE_BOUNDARIES = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A'  },
  { min: 70, grade: 'B+' },
  { min: 60, grade: 'B'  },
  { min: 50, grade: 'C'  },
  { min: 40, grade: 'D'  },
  { min: 0,  grade: 'F'  },
];

function getGrade(percentage: number): string {
  return GRADE_BOUNDARIES.find((b) => percentage >= b.min)?.grade ?? 'F';
}

function roundTwo(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Fetch Report Settings ────────────────────────────────────
export async function getReportSettings(academicYearId: string): Promise<ReportSettings | null> {
  const { rows } = await pool.query<ReportSettings>(
    `SELECT * FROM report_settings WHERE academic_year_id = $1`,
    [academicYearId],
  );
  return rows[0] ?? null;
}

export async function upsertReportSettings(
  input: Partial<ReportSettings> & { academic_year_id: string },
): Promise<ReportSettings> {
  const { academic_year_id, school_name, logo_url, principal_name,
          show_rank, show_attendance, show_insights, show_ai_remarks, footer_text } = input;

  const { rows } = await pool.query<ReportSettings>(
    `INSERT INTO report_settings
       (academic_year_id, school_name, logo_url, principal_name,
        show_rank, show_attendance, show_insights, show_ai_remarks, footer_text)
     VALUES ($1,
       COALESCE($2, 'K.J. School'),
       $3, $4,
       COALESCE($5, TRUE), COALESCE($6, TRUE), COALESCE($7, TRUE), COALESCE($8, TRUE),
       $9)
     ON CONFLICT (academic_year_id) DO UPDATE SET
       school_name    = COALESCE(EXCLUDED.school_name, report_settings.school_name),
       logo_url       = COALESCE(EXCLUDED.logo_url, report_settings.logo_url),
       principal_name = COALESCE(EXCLUDED.principal_name, report_settings.principal_name),
       show_rank      = COALESCE(EXCLUDED.show_rank, report_settings.show_rank),
       show_attendance = COALESCE(EXCLUDED.show_attendance, report_settings.show_attendance),
       show_insights  = COALESCE(EXCLUDED.show_insights, report_settings.show_insights),
       show_ai_remarks = COALESCE(EXCLUDED.show_ai_remarks, report_settings.show_ai_remarks),
       footer_text    = COALESCE(EXCLUDED.footer_text, report_settings.footer_text),
       updated_at     = NOW()
     RETURNING *`,
    [academic_year_id, school_name ?? null, logo_url ?? null, principal_name ?? null,
     show_rank ?? null, show_attendance ?? null, show_insights ?? null,
     show_ai_remarks ?? null, footer_text ?? null],
  );
  return rows[0];
}

// ─── Resolve Academic Year ────────────────────────────────────
async function resolveAcademicYear(id?: string): Promise<{ id: string; label: string }> {
  const { rows } = await pool.query<{ id: string; label: string }>(
    id
      ? `SELECT id, label FROM academic_years WHERE id = $1`
      : `SELECT id, label FROM academic_years WHERE is_current = TRUE LIMIT 1`,
    id ? [id] : [],
  );
  if (!rows[0]) throw Object.assign(new Error('Academic year not found'), { statusCode: 404 });
  return rows[0];
}

// ─────────────────────────────────────────────────────────────
//  PROGRESS CARD
// ─────────────────────────────────────────────────────────────

export async function getProgressCard(
  studentId: string,
  academicYearIdParam?: string,
  termId?: string,
): Promise<ProgressCardData> {
  const academicYear = await resolveAcademicYear(academicYearIdParam);

  // 1. Student info
  const { rows: studentRows } = await pool.query<{
    id: string; name: string; admission_number: string; roll_number: number;
    class_id: string; class_name: string; division_name: string; division_id: string;
  }>(
    `SELECT s.id, s.name, s.admission_number, s.roll_number,
            cl.id AS class_id, cl.name AS class_name,
            d.name AS division_name, d.id AS division_id
     FROM students s
     JOIN divisions d  ON d.id  = s.division_id
     JOIN classes   cl ON cl.id = d.class_id
     WHERE s.id = $1 AND s.academic_year_id = $2`,
    [studentId, academicYear.id],
  );
  if (!studentRows[0]) throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  const student = studentRows[0];

  // 2. Ordered exam columns (filtered by term if requested)
  const examQuery = termId
    ? `SELECT e.id AS exam_id, e.name AS exam_name, COALESCE(e.label, e.name) AS exam_label,
              et.code AS exam_type_code, t.term_number, et.max_marks_default AS max_marks,
              et.display_order AS et_order
       FROM exams e
       JOIN terms      t  ON t.id  = e.term_id
       JOIN exam_types et ON et.id = e.exam_type_id
       WHERE e.academic_year_id = $1 AND e.term_id = $2 AND e.is_active = TRUE
       ORDER BY t.term_number, et.display_order`
    : `SELECT e.id AS exam_id, e.name AS exam_name, COALESCE(e.label, e.name) AS exam_label,
              et.code AS exam_type_code, t.term_number, et.max_marks_default AS max_marks,
              et.display_order AS et_order
       FROM exams e
       JOIN terms      t  ON t.id  = e.term_id
       JOIN exam_types et ON et.id = e.exam_type_id
       WHERE e.academic_year_id = $1 AND e.is_active = TRUE
       ORDER BY t.term_number, et.display_order`;

  const { rows: examRows } = await pool.query<ProgressCardExamColumn & { et_order: number }>(
    examQuery,
    termId ? [academicYear.id, termId] : [academicYear.id],
  );

  // 3. Subjects for this class (non-elective + student's chosen electives)
  const { rows: subjectRows } = await pool.query<{
    subject_id: string; subject_name: string; subject_code: string; display_order: number;
  }>(
    `SELECT s.id AS subject_id, s.name AS subject_name, s.code AS subject_code, s.display_order
     FROM subjects s
     LEFT JOIN student_subjects ss ON ss.subject_id = s.id AND ss.student_id = $1
     WHERE s.class_id = $2
       AND s.is_active = TRUE
       AND (s.is_elective = FALSE OR ss.subject_id IS NOT NULL)
     ORDER BY s.display_order, s.name`,
    [studentId, student.class_id],
  );

  // 4. All marks for this student in this academic year
  const { rows: markRows } = await pool.query<{
    exam_id: string; subject_id: string; marks_obtained: number;
    is_absent: boolean; total_marks: number;
  }>(
    `SELECT m.exam_id, m.subject_id,
            m.marks_obtained::float AS marks_obtained,
            m.is_absent,
            sec.total_marks::float AS total_marks
     FROM marks m
     JOIN exams e ON e.id = m.exam_id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
     WHERE m.student_id = $1
       AND e.academic_year_id = $2
       AND m.component_id IS NULL
       AND e.is_active = TRUE`,
    [studentId, academicYear.id],
  );

  // 5. Attendance summary
  const { rows: attRows } = await pool.query<{
    total_working_days: number; total_absent: number;
  }>(
    `SELECT
       COUNT(DISTINCT wd.date)::int AS total_working_days,
       COUNT(DISTINCT a.date)::int  AS total_absent
     FROM working_days wd
     LEFT JOIN attendance a ON a.date = wd.date AND a.student_id = $1
     WHERE (wd.division_id = $2 OR wd.division_id IS NULL)
       AND wd.is_working = TRUE
       AND wd.date BETWEEN
         (SELECT start_date FROM academic_years WHERE id = $3)
         AND CURRENT_DATE`,
    [studentId, student.division_id, academicYear.id],
  );

  // 6. Remarks for this student
  const { rows: remarkRows } = await pool.query<{
    term_id: string | null; term_name: string | null; remark_text: string; is_ai_generated: boolean;
  }>(
    `SELECT rr.term_id, t.name AS term_name, rr.remark_text, rr.is_ai_generated
     FROM report_remarks rr
     LEFT JOIN terms t ON t.id = rr.term_id
     WHERE rr.student_id = $1 AND rr.academic_year_id = $2
     ORDER BY COALESCE(t.term_number, 999)`,
    [studentId, academicYear.id],
  );

  // 7. Settings
  let settings = await getReportSettings(academicYear.id);
  if (!settings) {
    settings = await upsertReportSettings({ academic_year_id: academicYear.id });
  }

  // ── Build mark lookup: examId → subjectId → cell
  const markMap = new Map<string, Map<string, { marks_obtained: number; is_absent: boolean; total_marks: number }>>();
  for (const row of markRows) {
    if (!markMap.has(row.exam_id)) markMap.set(row.exam_id, new Map());
    markMap.get(row.exam_id)!.set(row.subject_id, {
      marks_obtained: row.marks_obtained,
      is_absent: row.is_absent,
      total_marks: row.total_marks,
    });
  }

  // ── Build exam column info (use SEC total_marks per subject if available)
  const examColumns: ProgressCardExamColumn[] = examRows.map((e) => ({
    exam_id: e.exam_id,
    exam_name: e.exam_name,
    exam_label: e.exam_label,
    exam_type_code: e.exam_type_code,
    term_number: e.term_number,
    max_marks: e.max_marks,
  }));

  // ── Build subject rows
  let grandObtained = 0;
  let grandMax = 0;
  let subjectsPassed = 0;
  let subjectsFailed = 0;

  const subjects: ProgressCardSubjectRow[] = subjectRows.map((sub) => {
    const marks: Record<string, ProgressCardMarkCell> = {};
    let subObtained = 0;
    let subMax = 0;

    for (const col of examColumns) {
      const cell = markMap.get(col.exam_id)?.get(sub.subject_id);
      if (cell) {
        marks[col.exam_id] = {
          marks_obtained: cell.is_absent ? null : cell.marks_obtained,
          is_absent: cell.is_absent,
        };
        if (!cell.is_absent) {
          subObtained += cell.marks_obtained;
          subMax += cell.total_marks;
        } else {
          subMax += cell.total_marks;
        }
      } else {
        marks[col.exam_id] = { marks_obtained: null, is_absent: false };
        // Use default max from exam type if no config entry
        subMax += col.max_marks;
      }
    }

    const pct = subMax > 0 ? roundTwo((subObtained / subMax) * 100) : 0;
    const grade = getGrade(pct);
    const isPassing = pct >= 40;

    grandObtained += subObtained;
    grandMax += subMax;
    if (isPassing) subjectsPassed++; else subjectsFailed++;

    return {
      subject_id: sub.subject_id,
      subject_name: sub.subject_name,
      subject_code: sub.subject_code,
      display_order: sub.display_order,
      marks,
      total_obtained: roundTwo(subObtained),
      total_max: subMax,
      percentage: pct,
      grade,
      is_passing: isPassing,
    };
  });

  // ── Rank within division
  const { rows: rankRows } = await pool.query<{ rank: number; total: number }>(
    `WITH student_totals AS (
       SELECT m.student_id,
              SUM(m.marks_obtained)::float AS obtained
       FROM marks m
       JOIN exams e ON e.id = m.exam_id
       WHERE e.academic_year_id = $1
         AND m.component_id IS NULL
         AND m.is_absent = FALSE
       GROUP BY m.student_id
     ),
     division_students AS (
       SELECT s.id AS student_id FROM students s WHERE s.division_id = $2 AND s.academic_year_id = $1
     ),
     ranked AS (
       SELECT ds.student_id,
              RANK() OVER (ORDER BY COALESCE(st.obtained, 0) DESC)::int AS rank,
              COUNT(*) OVER ()::int AS total
       FROM division_students ds
       LEFT JOIN student_totals st ON st.student_id = ds.student_id
     )
     SELECT rank, total FROM ranked WHERE student_id = $3`,
    [academicYear.id, student.division_id, studentId],
  );

  const totals: ProgressCardTotals = {
    obtained: roundTwo(grandObtained),
    max: grandMax,
    percentage: grandMax > 0 ? roundTwo((grandObtained / grandMax) * 100) : 0,
    grade: getGrade(grandMax > 0 ? (grandObtained / grandMax) * 100 : 0),
    rank: rankRows[0]?.rank ?? null,
    total_students: rankRows[0]?.total ?? 0,
    subjects_passed: subjectsPassed,
    subjects_failed: subjectsFailed,
  };

  const att = attRows[0];
  const attendance = att
    ? {
        total_working_days: att.total_working_days,
        total_absent: att.total_absent,
        percentage: att.total_working_days > 0
          ? roundTwo(((att.total_working_days - att.total_absent) / att.total_working_days) * 100)
          : 100,
      }
    : null;

  return {
    student: {
      id: student.id,
      name: student.name,
      admission_number: student.admission_number,
      roll_number: student.roll_number,
      class_name: student.class_name,
      division_name: student.division_name,
    },
    academic_year: academicYear,
    settings,
    exam_columns: examColumns,
    subjects,
    totals,
    attendance,
    remarks: remarkRows,
  };
}

// ─────────────────────────────────────────────────────────────
//  CONSOLIDATED REPORT
// ─────────────────────────────────────────────────────────────

export async function getConsolidatedReportV2(
  divisionId: string,
  academicYearIdParam?: string,
  examIdsParam?: string,
  termId?: string,
): Promise<ConsolidatedReport> {
  const academicYear = await resolveAcademicYear(academicYearIdParam);

  // Division info
  const { rows: divRows } = await pool.query<{ class_id: string; class_name: string; division_name: string }>(
    `SELECT cl.id AS class_id, cl.name AS class_name, d.name AS division_name
     FROM divisions d JOIN classes cl ON cl.id = d.class_id
     WHERE d.id = $1`,
    [divisionId],
  );
  if (!divRows[0]) throw Object.assign(new Error('Division not found'), { statusCode: 404 });
  const div = divRows[0];

  // Determine exam ids to include
  let examIds: string[];
  if (examIdsParam) {
    examIds = examIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (termId) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT e.id FROM exams e WHERE e.academic_year_id = $1 AND e.term_id = $2 AND e.is_active = TRUE`,
      [academicYear.id, termId],
    );
    examIds = rows.map((r) => r.id);
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT e.id FROM exams e WHERE e.academic_year_id = $1 AND e.is_active = TRUE`,
      [academicYear.id],
    );
    examIds = rows.map((r) => r.id);
  }

  if (examIds.length === 0) {
    throw Object.assign(new Error('No exams found for specified criteria'), { statusCode: 404 });
  }

  // Subjects for this class
  const { rows: subjectRows } = await pool.query<ConsolidatedReportSubjectHeader>(
    `SELECT s.id AS subject_id, s.name AS subject_name, s.code AS subject_code,
            s.display_order,
            COALESCE(SUM(sec.total_marks), 0)::int AS max_marks
     FROM subjects s
     LEFT JOIN subject_exam_config sec ON sec.subject_id = s.id AND sec.exam_id = ANY($1::uuid[])
     WHERE s.class_id = $2 AND s.is_active = TRUE
     GROUP BY s.id, s.name, s.code, s.display_order
     ORDER BY s.display_order, s.name`,
    [examIds, div.class_id],
  );

  // All students in this division
  const { rows: studentRows } = await pool.query<{
    id: string; name: string; admission_number: string; roll_number: number;
  }>(
    `SELECT id, name, admission_number, roll_number
     FROM students
     WHERE division_id = $1 AND academic_year_id = $2 AND is_active = TRUE
     ORDER BY roll_number`,
    [divisionId, academicYear.id],
  );

  // All marks for these students + exams (component_id IS NULL = total mode)
  const { rows: markRows } = await pool.query<{
    student_id: string; subject_id: string; exam_id: string;
    marks_obtained: number; is_absent: boolean; total_marks: number;
  }>(
    `SELECT m.student_id, m.subject_id,
            m.marks_obtained::float AS marks_obtained,
            m.is_absent,
            sec.total_marks::float AS total_marks
     FROM marks m
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
     WHERE m.exam_id = ANY($1::uuid[])
       AND m.component_id IS NULL
       AND m.student_id = ANY($2::uuid[])`,
    [examIds, studentRows.map((s) => s.id)],
  );

  // Build mark lookup: student_id → subject_id → { obtained, max }
  type SubjectAgg = { obtained: number; max: number };
  const lookup = new Map<string, Map<string, SubjectAgg>>();
  for (const m of markRows) {
    if (!lookup.has(m.student_id)) lookup.set(m.student_id, new Map());
    const subMap = lookup.get(m.student_id)!;
    const existing = subMap.get(m.subject_id) ?? { obtained: 0, max: 0 };
    existing.obtained += m.is_absent ? 0 : m.marks_obtained;
    existing.max += m.total_marks;
    subMap.set(m.subject_id, existing);
  }

  // Build student rows + grand totals
  const studentData: Array<ConsolidatedStudentRow & { _grand: number }> = studentRows.map((st) => {
    const subMap = lookup.get(st.id) ?? new Map<string, SubjectAgg>();
    const subjectTotals: ConsolidatedStudentRow['subject_totals'] = {};
    let grandObt = 0;
    let grandMax = 0;
    let passed = 0;
    let failed = 0;

    for (const sub of subjectRows) {
      const agg = subMap.get(sub.subject_id) ?? { obtained: 0, max: sub.max_marks };
      const pct = agg.max > 0 ? roundTwo((agg.obtained / agg.max) * 100) : 0;
      subjectTotals[sub.subject_id] = {
        obtained: roundTwo(agg.obtained),
        max: agg.max,
        percentage: pct,
        grade: getGrade(pct),
      };
      grandObt += agg.obtained;
      grandMax += agg.max;
      if (pct >= 40) passed++; else failed++;
    }

    const grandPct = grandMax > 0 ? roundTwo((grandObt / grandMax) * 100) : 0;
    return {
      student_id: st.id,
      student_name: st.name,
      admission_number: st.admission_number,
      roll_number: st.roll_number,
      subject_totals: subjectTotals,
      grand_total_obtained: roundTwo(grandObt),
      grand_total_max: grandMax,
      grand_percentage: grandPct,
      grand_grade: getGrade(grandPct),
      rank: 0,  // computed below
      subjects_passed: passed,
      subjects_failed: failed,
      _grand: grandObt,
    };
  });

  // Rank by grand total
  studentData.sort((a, b) => b._grand - a._grand);
  let prevScore = -1;
  let prevRank = 0;
  const students: ConsolidatedStudentRow[] = studentData.map((s, i) => {
    if (s._grand !== prevScore) { prevScore = s._grand; prevRank = i + 1; }
    const { _grand, ...rest } = s;
    void _grand;
    return { ...rest, rank: prevRank };
  });
  // Restore roll number order for display
  students.sort((a, b) => a.roll_number - b.roll_number);

  // Class averages + pass rates per subject
  const classAverages: Record<string, number> = {};
  const classPassRates: Record<string, number> = {};
  for (const sub of subjectRows) {
    const percentages = students.map((s) => s.subject_totals[sub.subject_id]?.percentage ?? 0);
    classAverages[sub.subject_id] = percentages.length
      ? roundTwo(percentages.reduce((a, b) => a + b, 0) / percentages.length)
      : 0;
    classPassRates[sub.subject_id] = percentages.length
      ? roundTwo((percentages.filter((p) => p >= 40).length / percentages.length) * 100)
      : 0;
  }

  return {
    division_id: divisionId,
    class_name: div.class_name,
    division_name: div.division_name,
    academic_year: academicYear,
    exam_ids: examIds,
    subject_headers: subjectRows,
    students,
    class_averages: classAverages,
    class_pass_rates: classPassRates,
  };
}
