// =============================================================
// KJSIS — Phase 4: Remarks Service
// AI-generated rule-based remarks + CRUD
// =============================================================

import { pool } from '../utils/db';
import { ReportRemark } from '../types';
import { getProgressCard } from './reports-v2.service';

// ─── Fetch Remarks ────────────────────────────────────────────
export async function getRemarksForStudent(
  studentId: string,
  academicYearId: string,
): Promise<ReportRemark[]> {
  const { rows } = await pool.query<ReportRemark>(
    `SELECT * FROM report_remarks
     WHERE student_id = $1 AND academic_year_id = $2
     ORDER BY COALESCE((SELECT term_number FROM terms WHERE id = term_id), 999)`,
    [studentId, academicYearId],
  );
  return rows;
}

// ─── Upsert Remark (manual edit) ─────────────────────────────
// PostgreSQL partial unique indexes require the predicate in ON CONFLICT,
// so we use separate INSERT paths for annual vs term remarks.
export async function upsertRemark(
  studentId: string,
  academicYearId: string,
  termId: string | null,
  remarkText: string,
  editedBy: string,
): Promise<ReportRemark> {
  let rows: ReportRemark[];

  if (termId === null) {
    // Annual remark — uses uq_report_remarks_annual (WHERE term_id IS NULL)
    ({ rows } = await pool.query<ReportRemark>(
      `INSERT INTO report_remarks
         (student_id, academic_year_id, term_id, remark_text, is_ai_generated, edited_by)
       VALUES ($1, $2, NULL, $3, FALSE, $4)
       ON CONFLICT (student_id, academic_year_id)
       WHERE term_id IS NULL
       DO UPDATE SET
         remark_text     = EXCLUDED.remark_text,
         is_ai_generated = FALSE,
         edited_by       = EXCLUDED.edited_by,
         updated_at      = NOW()
       RETURNING *`,
      [studentId, academicYearId, remarkText, editedBy],
    ));
  } else {
    // Term-specific remark — uses uq_report_remarks_term (WHERE term_id IS NOT NULL)
    ({ rows } = await pool.query<ReportRemark>(
      `INSERT INTO report_remarks
         (student_id, academic_year_id, term_id, remark_text, is_ai_generated, edited_by)
       VALUES ($1, $2, $3, $4, FALSE, $5)
       ON CONFLICT (student_id, academic_year_id, term_id)
       WHERE term_id IS NOT NULL
       DO UPDATE SET
         remark_text     = EXCLUDED.remark_text,
         is_ai_generated = FALSE,
         edited_by       = EXCLUDED.edited_by,
         updated_at      = NOW()
       RETURNING *`,
      [studentId, academicYearId, termId, remarkText, editedBy],
    ));
  }

  return rows[0];
}

// ─── AI Remark Generation ─────────────────────────────────────
// Rule-based engine — generates a human-readable remark from performance data.
// Does NOT call any external AI API.

interface RemarkContext {
  studentName: string;
  percentage: number;
  subjectsPassed: number;
  subjectsFailed: number;
  attendance: number | null;      // attendance %
  trend: 'improving' | 'declining' | 'stable' | null;
  weakSubjects: string[];
  strongSubjects: string[];
  termName: string | null;        // null = annual
}

function buildRemarkText(ctx: RemarkContext): string {
  const firstName = ctx.studentName.split(' ')[0];
  const lines: string[] = [];

  // Opening with performance tier
  if (ctx.percentage >= 85) {
    lines.push(`${firstName} has demonstrated outstanding academic performance`
      + (ctx.termName ? ` in ${ctx.termName}` : ' throughout the year')
      + `, achieving ${ctx.percentage.toFixed(1)}%.`);
  } else if (ctx.percentage >= 70) {
    lines.push(`${firstName} has shown commendable progress`
      + (ctx.termName ? ` in ${ctx.termName}` : ' this academic year')
      + ` with an overall score of ${ctx.percentage.toFixed(1)}%.`);
  } else if (ctx.percentage >= 50) {
    lines.push(`${firstName} has performed satisfactorily`
      + (ctx.termName ? ` in ${ctx.termName}` : '')
      + ` with ${ctx.percentage.toFixed(1)}%, showing consistent effort.`);
  } else if (ctx.percentage >= 40) {
    lines.push(`${firstName} has secured a passing score of ${ctx.percentage.toFixed(1)}%`
      + (ctx.termName ? ` in ${ctx.termName}` : '')
      + `. There is significant scope for improvement.`);
  } else {
    lines.push(`${firstName} has scored ${ctx.percentage.toFixed(1)}%`
      + (ctx.termName ? ` in ${ctx.termName}` : '')
      + ` and requires focused attention and additional support.`);
  }

  // Subject strengths
  if (ctx.strongSubjects.length > 0) {
    lines.push(`Particularly strong in ${ctx.strongSubjects.slice(0, 2).join(' and ')}.`);
  }

  // Weak subjects
  if (ctx.weakSubjects.length > 0) {
    lines.push(`Additional effort is needed in ${ctx.weakSubjects.slice(0, 2).join(' and ')}.`);
  }

  // Trend
  if (ctx.trend === 'improving') {
    lines.push('The upward trend in performance is encouraging.');
  } else if (ctx.trend === 'declining') {
    lines.push('A decline in performance has been observed; early intervention is advised.');
  }

  // Attendance
  if (ctx.attendance !== null && ctx.attendance < 75) {
    lines.push(`Attendance of ${ctx.attendance.toFixed(1)}% is below the required 75%. Regular presence is essential.`);
  }

  // Closing
  if (ctx.percentage >= 75) {
    lines.push('Keep up the excellent work!');
  } else if (ctx.percentage >= 50) {
    lines.push('With continued dedication, further improvement is expected.');
  } else {
    lines.push('Parents are encouraged to provide support and monitor academic progress regularly.');
  }

  return lines.join(' ');
}

export async function generateAIRemark(
  studentId: string,
  academicYearId: string,
  termId?: string,
  overwrite = false,
): Promise<ReportRemark> {
  // Check if remark already exists and overwrite not requested
  if (!overwrite) {
    const existing = await getRemarksForStudent(studentId, academicYearId);
    const match = existing.find((r) => r.term_id === (termId ?? null));
    if (match) return match;
  }

  // Fetch progress card data
  const card = await getProgressCard(studentId, academicYearId, termId);

  // Identify strong and weak subjects
  const sorted = [...card.subjects].sort((a, b) => b.percentage - a.percentage);
  const strongSubjects = sorted.filter((s) => s.percentage >= 70).map((s) => s.subject_name);
  const weakSubjects   = sorted.filter((s) => s.percentage < 40).map((s) => s.subject_name);

  // Determine term name
  let termName: string | null = null;
  if (termId) {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT name FROM terms WHERE id = $1`,
      [termId],
    );
    termName = rows[0]?.name ?? null;
  }

  // Compute trend if term-specific (compare to previous term)
  let trend: RemarkContext['trend'] = null;
  if (termId) {
    const { rows: trendRows } = await pool.query<{ term_number: number; avg_pct: number }>(
      `SELECT t.term_number,
              AVG(m.marks_obtained::float / NULLIF(sec.total_marks, 0) * 100)::float AS avg_pct
       FROM marks m
       JOIN exams e ON e.id = m.exam_id
       JOIN terms t ON t.id = e.term_id
       JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
       WHERE m.student_id = $1
         AND e.academic_year_id = $2
         AND m.component_id IS NULL
         AND m.is_absent = FALSE
       GROUP BY t.term_number
       ORDER BY t.term_number`,
      [studentId, academicYearId],
    );
    if (trendRows.length >= 2) {
      const delta = trendRows[trendRows.length - 1].avg_pct - trendRows[0].avg_pct;
      trend = delta > 5 ? 'improving' : delta < -5 ? 'declining' : 'stable';
    }
  }

  const remarkText = buildRemarkText({
    studentName: card.student.name,
    percentage: card.totals.percentage,
    subjectsPassed: card.totals.subjects_passed,
    subjectsFailed: card.totals.subjects_failed,
    attendance: card.attendance?.percentage ?? null,
    trend,
    weakSubjects,
    strongSubjects,
    termName,
  });

  // Upsert AI remark
  const { rows } = await pool.query<ReportRemark>(
    termId
      ? `INSERT INTO report_remarks
           (student_id, academic_year_id, term_id, remark_text, is_ai_generated)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (student_id, academic_year_id, term_id)
         WHERE term_id IS NOT NULL
         DO UPDATE SET remark_text = EXCLUDED.remark_text, is_ai_generated = TRUE,
                       edited_by = NULL, updated_at = NOW()
         RETURNING *`
      : `INSERT INTO report_remarks
           (student_id, academic_year_id, term_id, remark_text, is_ai_generated)
         VALUES ($1, $2, NULL, $3, TRUE)
         ON CONFLICT (student_id, academic_year_id)
         WHERE term_id IS NULL
         DO UPDATE SET remark_text = EXCLUDED.remark_text, is_ai_generated = TRUE,
                       edited_by = NULL, updated_at = NOW()
         RETURNING *`,
    termId ? [studentId, academicYearId, termId, remarkText]
           : [studentId, academicYearId, remarkText],
  );
  return rows[0];
}

// ─── Bulk Generate for Division ───────────────────────────────
export async function generateRemarksForDivision(
  divisionId: string,
  academicYearId: string,
  termId?: string,
  overwrite = false,
): Promise<{ generated: number; skipped: number }> {
  const { rows: students } = await pool.query<{ id: string }>(
    `SELECT id FROM students WHERE division_id = $1 AND academic_year_id = $2 AND is_active = TRUE`,
    [divisionId, academicYearId],
  );

  let generated = 0;
  let skipped = 0;

  for (const student of students) {
    try {
      const existing = overwrite ? null : await pool.query(
        `SELECT id FROM report_remarks WHERE student_id = $1 AND academic_year_id = $2 AND term_id ${termId ? '= $3' : 'IS NULL'}`,
        termId ? [student.id, academicYearId, termId] : [student.id, academicYearId],
      );
      if (existing && existing.rows.length > 0) { skipped++; continue; }
      await generateAIRemark(student.id, academicYearId, termId, overwrite);
      generated++;
    } catch {
      skipped++;
    }
  }

  return { generated, skipped };
}
