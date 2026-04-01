// =============================================================
// KJSIS — Reports Service (Phase 2: ranking, percentile, grades)
// =============================================================

import { query } from '../utils/db';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { UserRole } from '../types';
import { getCache, setCache } from '../utils/cache';

// ─── Grade Boundaries (configurable per school) ───────────────
interface GradeBoundary {
  grade: string;
  label: string;
  min: number;   // percentage
  max: number;
  color: string; // for UI
}

const DEFAULT_GRADE_BOUNDARIES: GradeBoundary[] = [
  { grade: 'A+', label: 'Outstanding',  min: 90, max: 100, color: '#22c55e' },
  { grade: 'A',  label: 'Excellent',    min: 80, max: 89,  color: '#4ade80' },
  { grade: 'B+', label: 'Very Good',    min: 70, max: 79,  color: '#86efac' },
  { grade: 'B',  label: 'Good',         min: 60, max: 69,  color: '#fbbf24' },
  { grade: 'C',  label: 'Average',      min: 50, max: 59,  color: '#f97316' },
  { grade: 'D',  label: 'Below Average',min: 40, max: 49,  color: '#ef4444' },
  { grade: 'F',  label: 'Fail',         min: 0,  max: 39,  color: '#7f1d1d' },
];

const getGrade = (pct: number): GradeBoundary => {
  return (
    DEFAULT_GRADE_BOUNDARIES.find((g) => pct >= g.min && pct <= g.max) ??
    DEFAULT_GRADE_BOUNDARIES[DEFAULT_GRADE_BOUNDARIES.length - 1]
  );
};

const calcPercentile = (values: number[], value: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return Math.round((below / sorted.length) * 100);
};

// ─── Guard: teacher owns subject ─────────────────────────────
const assertTeacherOwnsSubject = async (
  teacherId: string,
  divisionId: string,
  subjectId: string,
): Promise<void> => {
  const result = await query<{ id: string }>(
    `SELECT tsm.id FROM teacher_subject_map tsm
     JOIN academic_years ay ON tsm.academic_year_id = ay.id
     WHERE tsm.teacher_id = $1 AND tsm.division_id = $2
       AND tsm.subject_id = $3 AND tsm.is_active = TRUE AND ay.is_current = TRUE LIMIT 1`,
    [teacherId, divisionId, subjectId],
  );
  if (!result.rows[0]) throw new ForbiddenError('You are not assigned to this subject');
};

// =============================================================
// REPORT 1: Subject Report (Phase 2: + rank, percentile, grade)
// =============================================================
export const getSubjectReport = async (
  subjectId: string,
  examId: string,
  divisionId: string,
  requesterId: string,
  requesterRole: UserRole,
) => {
  if (requesterRole === 'teacher') {
    await assertTeacherOwnsSubject(requesterId, divisionId, subjectId);
  }

  const result = await query(
    `SELECT
       s.roll_number,
       s.name            AS student_name,
       s.admission_number,
       m.marks_obtained,
       m.is_absent,
       m.status,
       sec.total_marks,
       sec.passing_marks
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN marks m
       ON m.student_id = s.id AND m.subject_id = $1 AND m.exam_id = $2 AND m.component_id IS NULL
     LEFT JOIN subject_exam_config sec ON sec.subject_id = $1 AND sec.exam_id = $2
     WHERE s.division_id = $3 AND s.is_active = TRUE AND ay.is_current = TRUE
     ORDER BY s.roll_number`,
    [subjectId, examId, divisionId],
  );

  // Compute all mark percentages for ranking/percentile
  const markValues: number[] = result.rows
    .filter((r) => r.marks_obtained !== null && !r.is_absent)
    .map((r) => parseFloat(r.marks_obtained));

  const allPcts = result.rows
    .filter((r) => r.marks_obtained !== null && !r.is_absent && r.total_marks > 0)
    .map((r) => Math.round((parseFloat(r.marks_obtained) / r.total_marks) * 100 * 10) / 10);

  // Sort descending for rank assignment
  const sortedMarks = [...markValues].sort((a, b) => b - a);
  let rank = 0;
  let prevMark: number | null = null;
  const rankMap = new Map<number, number>();
  for (const mark of sortedMarks) {
    if (mark !== prevMark) rank++;
    rankMap.set(mark, rank);
    prevMark = mark;
  }

  const students = result.rows.map((r) => {
    const marksObtained = r.marks_obtained !== null ? parseFloat(r.marks_obtained) : null;
    const pct = marksObtained !== null && !r.is_absent && r.total_marks > 0
      ? Math.round((marksObtained / r.total_marks) * 100 * 10) / 10
      : null;

    const grade = pct !== null ? getGrade(pct) : null;
    const studentRank = marksObtained !== null && !r.is_absent ? rankMap.get(marksObtained) ?? null : null;
    const percentile = pct !== null ? calcPercentile(allPcts, pct) : null;

    return {
      roll_number:       r.roll_number,
      student_name:      r.student_name,
      admission_number:  r.admission_number,
      marks_obtained:    marksObtained,
      total_marks:       r.total_marks,
      passing_marks:     r.passing_marks,
      is_absent:         r.is_absent ?? false,
      status:            r.status,
      percentage:        pct,
      grade:             grade?.grade ?? null,
      grade_label:       grade?.label ?? null,
      grade_color:       grade?.color ?? null,
      rank:              studentRank,
      percentile,
      result: r.is_absent
        ? 'AB'
        : marksObtained === null
        ? 'PENDING'
        : marksObtained >= r.passing_marks
        ? 'PASS'
        : 'FAIL',
    };
  });

  // Class-level stats
  const presentStudents = students.filter((s) => !s.is_absent && s.marks_obtained !== null);
  const passedStudents  = presentStudents.filter((s) => s.result === 'PASS');

  const avgPct = presentStudents.length > 0
    ? Math.round((presentStudents.reduce((sum, s) => sum + (s.percentage ?? 0), 0) / presentStudents.length) * 10) / 10
    : 0;

  const classGrade = getGrade(avgPct);

  return {
    grade_boundaries: DEFAULT_GRADE_BOUNDARIES,
    students,
    summary: {
      total_students:    students.length,
      present:           presentStudents.length,
      absent:            students.filter((s) => s.is_absent).length,
      passed:            passedStudents.length,
      failed:            presentStudents.filter((s) => s.result === 'FAIL').length,
      pass_percentage:   presentStudents.length > 0
        ? Math.round((passedStudents.length / presentStudents.length) * 100)
        : 0,
      average_marks_pct: avgPct,
      class_grade:       classGrade.grade,
      highest:           presentStudents.length > 0 ? Math.max(...presentStudents.map((s) => s.marks_obtained!)) : null,
      lowest:            presentStudents.length > 0 ? Math.min(...presentStudents.map((s) => s.marks_obtained!)) : null,
      grade_distribution: DEFAULT_GRADE_BOUNDARIES.map((g) => ({
        grade: g.grade,
        label: g.label,
        count: presentStudents.filter((s) => s.grade === g.grade).length,
      })),
    },
  };
};

// =============================================================
// REPORT 2: Consolidated marks report (class teacher / exam cell)
// =============================================================
export const getConsolidatedReport = async (
  divisionId: string,
  examId: string,
  requesterId: string,
  requesterRole: UserRole,
) => {
  if (requesterRole === 'teacher') {
    const isClassTeacher = await query<{ id: string }>(
      `SELECT ct.id FROM class_teachers ct
       JOIN academic_years ay ON ct.academic_year_id = ay.id
       WHERE ct.teacher_id = $1 AND ct.division_id = $2
         AND ct.is_active = TRUE AND ay.is_current = TRUE`,
      [requesterId, divisionId],
    );
    if (!isClassTeacher.rows[0]) throw new ForbiddenError('Only class teacher can view consolidated reports');
  }

  const subjectsResult = await query<{ id: string; name: string; code: string; total_marks: number }>(
    `SELECT DISTINCT s.id, s.name, s.code, sec.total_marks
     FROM subjects s
     JOIN classes c ON s.class_id = c.id
     JOIN divisions d ON d.class_id = c.id
     JOIN subject_exam_config sec ON sec.subject_id = s.id AND sec.exam_id = $2
     WHERE d.id = $1 AND s.is_active = TRUE AND sec.is_active = TRUE
     ORDER BY s.display_order`,
    [divisionId, examId],
  );

  const marksResult = await query(
    `SELECT
       s.id, s.roll_number, s.name AS student_name,
       subj.id AS subject_id,
       m.marks_obtained, m.is_absent, sec.total_marks, sec.passing_marks
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     CROSS JOIN subjects subj
     JOIN subject_exam_config sec ON sec.subject_id = subj.id AND sec.exam_id = $2
     JOIN classes c ON subj.class_id = c.id
     JOIN divisions d ON d.class_id = c.id AND d.id = $1
     LEFT JOIN marks m ON m.student_id = s.id AND m.subject_id = subj.id
       AND m.exam_id = $2 AND m.component_id IS NULL
     WHERE s.division_id = $1 AND s.is_active = TRUE AND ay.is_current = TRUE
       AND subj.is_active = TRUE AND sec.is_active = TRUE
     ORDER BY s.roll_number, subj.display_order`,
    [divisionId, examId],
  );

  // Pivot into student → subjects
  const studentMap = new Map<string, {
    id: string; roll_number: number; student_name: string;
    subjects: Record<string, unknown>; total_obtained: number; total_max: number;
  }>();

  for (const row of marksResult.rows) {
    if (!studentMap.has(row.id)) {
      studentMap.set(row.id, {
        id: row.id, roll_number: row.roll_number, student_name: row.student_name,
        subjects: {}, total_obtained: 0, total_max: 0,
      });
    }
    const student = studentMap.get(row.id)!;
    const obtained = !row.is_absent && row.marks_obtained !== null ? parseFloat(row.marks_obtained) : 0;
    const pct = row.total_marks > 0 ? Math.round((obtained / row.total_marks) * 100 * 10) / 10 : 0;
    student.subjects[row.subject_id] = {
      marks_obtained: row.marks_obtained,
      total_marks:    row.total_marks,
      passing_marks:  row.passing_marks,
      is_absent:      row.is_absent,
      percentage:     pct,
      grade:          row.is_absent ? null : getGrade(pct).grade,
      result:         row.is_absent ? 'AB' : row.marks_obtained === null ? 'PENDING'
                       : obtained >= row.passing_marks ? 'PASS' : 'FAIL',
    };
    if (!row.is_absent && row.marks_obtained !== null) {
      student.total_obtained += obtained;
      student.total_max      += row.total_marks;
    }
  }

  const students = Array.from(studentMap.values()).map((s) => ({
    ...s,
    overall_pct:   s.total_max > 0 ? Math.round((s.total_obtained / s.total_max) * 100 * 10) / 10 : 0,
    overall_grade: s.total_max > 0 ? getGrade(Math.round((s.total_obtained / s.total_max) * 100)).grade : null,
  })).sort((a, b) => a.roll_number - b.roll_number);

  // Rank by overall percentage
  const sortedByPct = [...students].sort((a, b) => b.overall_pct - a.overall_pct);
  let rankVal = 0; let prevPct: number | null = null;
  for (const s of sortedByPct) {
    if (s.overall_pct !== prevPct) rankVal++;
    (s as typeof s & { rank: number }).rank = rankVal;
    prevPct = s.overall_pct;
  }

  return { subjects: subjectsResult.rows, students, grade_boundaries: DEFAULT_GRADE_BOUNDARIES };
};

// =============================================================
// REPORT 3: Class-wise performance summary
// =============================================================
export const getClassPerformance = async (examId: string) => {
  const cacheKey = `report:class-perf:${examId}`;
  const cached = getCache<unknown[]>(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT
       c.name AS class_name, c.grade_number, d.name AS division_name,
       COUNT(DISTINCT s.id) AS total_students,
       ROUND(AVG(m.marks_obtained) FILTER (WHERE NOT m.is_absent), 1) AS avg_marks,
       ROUND(
         AVG((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100) FILTER (WHERE NOT m.is_absent), 1
       ) AS avg_pct,
       COUNT(m.id) FILTER (WHERE m.marks_obtained >= sec.passing_marks AND NOT m.is_absent) AS passed,
       COUNT(m.id) FILTER (WHERE m.marks_obtained < sec.passing_marks  AND NOT m.is_absent) AS failed,
       COUNT(m.id) FILTER (WHERE m.is_absent) AS absent
     FROM divisions d
     JOIN classes c ON d.class_id = c.id
     JOIN students s ON s.division_id = d.id
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN marks m ON m.student_id = s.id AND m.exam_id = $1
     LEFT JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = $1
     WHERE ay.is_current = TRUE AND s.is_active = TRUE
     GROUP BY c.name, c.grade_number, d.name, d.id
     ORDER BY c.grade_number, d.name`,
    [examId],
  );

  const data = result.rows.map((r) => ({
    ...r,
    class_grade: r.avg_pct !== null ? getGrade(parseFloat(r.avg_pct)).grade : null,
  }));

  setCache(cacheKey, data, 15 * 60);
  return data;
};

// =============================================================
// REPORT 4: Subject-wise analysis
// =============================================================
export const getSubjectAnalysis = async (examId: string) => {
  const result = await query(
    `SELECT
       subj.name AS subject_name, subj.code AS subject_code,
       c.name AS class_name, d.name AS division_name,
       COUNT(m.id) AS total_entries,
       ROUND(AVG(m.marks_obtained) FILTER (WHERE NOT m.is_absent), 1) AS avg_marks,
       ROUND(
         AVG((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100) FILTER (WHERE NOT m.is_absent), 1
       ) AS avg_pct,
       MAX(m.marks_obtained) FILTER (WHERE NOT m.is_absent) AS highest,
       MIN(m.marks_obtained) FILTER (WHERE NOT m.is_absent) AS lowest,
       COUNT(m.id) FILTER (WHERE m.marks_obtained < sec.passing_marks AND NOT m.is_absent) AS fail_count,
       sec.total_marks, sec.passing_marks
     FROM marks m
     JOIN students s ON m.student_id = s.id
     JOIN divisions d ON s.division_id = d.id
     JOIN classes c ON d.class_id = c.id
     JOIN subjects subj ON m.subject_id = subj.id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = $1
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE m.exam_id = $1 AND ay.is_current = TRUE AND s.is_active = TRUE
     GROUP BY subj.name, subj.code, c.name, c.grade_number, d.name, sec.total_marks, sec.passing_marks
     ORDER BY c.grade_number, d.name, subj.display_order`,
    [examId],
  );

  return result.rows.map((r) => ({
    ...r,
    subject_grade: r.avg_pct !== null ? getGrade(parseFloat(r.avg_pct)).grade : null,
  }));
};

// =============================================================
// REPORT 5: Student report card
// =============================================================
export const getStudentReportCard = async (studentId: string) => {
  const studentResult = await query(
    `SELECT s.id, s.name, s.roll_number, s.admission_number,
            d.name AS division, c.name AS class, ay.label AS academic_year
     FROM students s
     JOIN divisions d ON s.division_id = d.id
     JOIN classes c ON d.class_id = c.id
     JOIN academic_years ay ON s.academic_year_id = ay.id
     WHERE s.id = $1`,
    [studentId],
  );

  if (!studentResult.rows[0]) throw new NotFoundError('Student');

  const marksResult = await query(
    `SELECT
       e.name AS exam_name, e.label AS exam_label,
       subj.name AS subject_name, subj.code AS subject_code,
       m.marks_obtained, m.is_absent, sec.total_marks, sec.passing_marks
     FROM marks m
     JOIN exams e ON m.exam_id = e.id
     JOIN subjects subj ON m.subject_id = subj.id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
     WHERE m.student_id = $1 AND m.component_id IS NULL
     ORDER BY e.start_date, subj.display_order`,
    [studentId],
  );

  const attendanceResult = await query<{ total_absent: string }>(
    `SELECT COUNT(*) AS total_absent FROM attendance WHERE student_id = $1`,
    [studentId],
  );

  // Enrich marks with grades
  const marks = marksResult.rows.map((r) => {
    const obtained = !r.is_absent && r.marks_obtained !== null ? parseFloat(r.marks_obtained) : null;
    const pct = obtained !== null && r.total_marks > 0
      ? Math.round((obtained / r.total_marks) * 100 * 10) / 10
      : null;
    return {
      ...r,
      marks_obtained: obtained,
      percentage:     pct,
      grade:          pct !== null ? getGrade(pct).grade : null,
      result:         r.is_absent ? 'AB' : obtained === null ? 'PENDING'
                       : obtained >= r.passing_marks ? 'PASS' : 'FAIL',
    };
  });

  return {
    student:    studentResult.rows[0],
    marks,
    attendance: { total_absent: parseInt(attendanceResult.rows[0]?.total_absent ?? '0') },
    grade_boundaries: DEFAULT_GRADE_BOUNDARIES,
  };
};

// =============================================================
// REPORT 6: At-risk students (VP/Principal)
// =============================================================
// ─── Term-wise Progress (per student × subject) ───────────────
export const getTermWiseProgress = async (
  studentId: string,
  academicYearId: string,
): Promise<import('../types').StudentTermWiseProgress[]> => {
  const result = await query<{
    subject_id:      string;
    subject_name:    string;
    term_id:         string;
    term_number:     number;
    term_name:       string;
    exam_id:         string;
    exam_name:       string;
    exam_type_code:  string | null;
    marks_obtained:  number;
    total_marks:     number;
    is_absent:       boolean;
  }>(
    `SELECT
       sub.id            AS subject_id,
       sub.name          AS subject_name,
       t.id              AS term_id,
       t.term_number,
       t.name            AS term_name,
       e.id              AS exam_id,
       e.name            AS exam_name,
       et.code           AS exam_type_code,
       m.marks_obtained,
       sec.total_marks,
       m.is_absent
     FROM marks m
     JOIN exams               e   ON e.id   = m.exam_id
     JOIN terms               t   ON t.id   = e.term_id
     JOIN exam_types          et  ON et.id  = e.exam_type_id
     JOIN subjects            sub ON sub.id = m.subject_id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id
                                  AND sec.exam_id   = m.exam_id
     WHERE m.student_id         = $1
       AND e.academic_year_id   = $2
       AND m.component_id IS NULL
       AND m.status IN ('submitted', 'locked')
     ORDER BY sub.name, t.term_number, et.display_order`,
    [studentId, academicYearId],
  );

  // Group by subject → term → exams
  const bySubject = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const arr = bySubject.get(row.subject_id) ?? [];
    arr.push(row);
    bySubject.set(row.subject_id, arr);
  }

  const output: import('../types').StudentTermWiseProgress[] = [];

  for (const [subject_id, rows] of bySubject.entries()) {
    const byTerm = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byTerm.get(r.term_id) ?? [];
      arr.push(r);
      byTerm.set(r.term_id, arr);
    }

    const terms: import('../types').TermProgress[] = [];
    for (const [term_id, termRows] of byTerm.entries()) {
      const exams: import('../types').TermMark[] = termRows.map((r) => {
        const pct = r.total_marks > 0
          ? Math.round((r.marks_obtained / r.total_marks) * 100)
          : 0;
        return {
          exam_id:        r.exam_id,
          exam_name:      r.exam_name,
          exam_type_code: r.exam_type_code ?? '',
          marks_obtained: r.marks_obtained,
          total_marks:    r.total_marks,
          percentage:     pct,
          is_absent:      r.is_absent,
        };
      });

      const totalObtained = exams.reduce((s, e) => s + (e.is_absent ? 0 : e.marks_obtained), 0);
      const totalMax      = exams.reduce((s, e) => s + e.total_marks, 0);
      const termPct       = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;

      terms.push({
        term_id,
        term_number: termRows[0].term_number,
        term_name:   termRows[0].term_name,
        exams,
        term_percentage: termPct,
        term_grade:      getGrade(termPct).grade,
      });
    }

    terms.sort((a, b) => a.term_number - b.term_number);

    // Trend: compare first vs last term percentage
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (terms.length >= 2) {
      const delta = terms[terms.length - 1].term_percentage - terms[0].term_percentage;
      if (delta >= 5)       trend = 'improving';
      else if (delta <= -5) trend = 'declining';
    }

    output.push({
      student_id:   studentId,
      student_name: rows[0]?.subject_name ?? '',
      subject_id,
      subject_name: rows[0].subject_name,
      terms,
      overall_trend: trend,
    });
  }

  return output;
};

export const getAtRiskStudents = async (
  divisionId?: string,
  markThreshold = 40,
  attendanceThreshold = 75,
) => {
  const result = await query(
    `WITH student_avg AS (
       SELECT m.student_id,
         ROUND(AVG((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100), 1) AS avg_pct
       FROM marks m
       JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
       JOIN exams e ON m.exam_id = e.id
       JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE ay.is_current = TRUE AND m.component_id IS NULL
       GROUP BY m.student_id
     )
     SELECT
       s.id, s.name, s.roll_number,
       d.name AS division, c.name AS class, c.grade_number,
       COALESCE(sa.avg_pct, 0) AS avg_marks_pct,
       COALESCE(sa.avg_pct, 0) < $1 AS low_marks
     FROM students s
     JOIN divisions d ON s.division_id = d.id
     JOIN classes   c ON d.class_id    = c.id
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN student_avg sa ON sa.student_id = s.id
     WHERE s.is_active = TRUE AND ay.is_current = TRUE
       ${divisionId ? "AND s.division_id = '" + divisionId + "'" : ''}
       AND COALESCE(sa.avg_pct, 0) < $1
     ORDER BY c.grade_number, d.name, s.roll_number`,
    [markThreshold, ...(divisionId ? [] : [])],
  );

  return result.rows.map((r) => ({
    ...r,
    grade: getGrade(parseFloat(r.avg_marks_pct)).grade,
  }));
};
