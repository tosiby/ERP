// =============================================================
// KJSIS — Report Builder Service
// Single source of truth: marks + attendance + AI insights → FullReport
//
// Architecture:
//   reportBuilder assembles data from multiple sources:
//   ├── reports-v2.service  → marks, subjects, totals, settings, attendance, remarks
//   └── ai-engine (local)   → risk score, trend, suggestions, flags
//
// Output: FullReport (typed JSON) — consumed by JSON API and PDF renderer
// =============================================================

import { pool } from '../utils/db';
import {
  getProgressCard,
  getConsolidatedReportV2,
  getReportSettings,
  upsertReportSettings,
} from './reports-v2.service';
import { ProgressCardData, ProgressCardExamColumn } from '../types';

// ─── Exported Types ───────────────────────────────────────────

export interface StudentInsights {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;                // 0–100 composite
  risk_flags: string[];              // human-readable indicators
  trend: 'improving' | 'declining' | 'stable';
  trend_delta: number;               // % points: last term − first term
  weak_subjects: SubjectStat[];      // pct < 50, sorted ascending
  strong_subjects: SubjectStat[];    // pct ≥ 70, sorted descending
  suggestions: string[];             // actionable next steps
  predicted_annual_percentage: number | null;
}

export interface SubjectStat {
  name: string;
  percentage: number;
  grade: string;
}

export interface FullReport extends ProgressCardData {
  insights: StudentInsights;
  generated_at: string;
}

// ─── Internal Helpers ─────────────────────────────────────────

function computeTermPct(
  cols: ProgressCardExamColumn[],
  subjects: ProgressCardData['subjects'],
): number {
  let obt = 0;
  let max = 0;
  for (const sub of subjects) {
    for (const col of cols) {
      const cell = sub.marks[col.exam_id];
      if (cell && !cell.is_absent && cell.marks_obtained !== null) {
        obt += cell.marks_obtained;
      }
      max += col.max_marks;
    }
  }
  return max > 0 ? (obt / max) * 100 : 0;
}

function computeInsights(card: ProgressCardData): StudentInsights {
  const pct = card.totals.percentage;
  const attPct = card.attendance?.percentage ?? 100;
  const failCount = card.totals.subjects_failed;

  // ── Risk Score: 50% marks + 30% attendance + 20% fail history
  const markRisk  = Math.max(0, (60 - pct) / 60) * 50;
  const attRisk   = Math.max(0, (75 - attPct) / 75) * 30;
  const failRisk  = Math.min(failCount * 5, 20);
  const riskScore = Math.min(100, Math.round(markRisk + attRisk + failRisk));

  const riskLevel: StudentInsights['risk_level'] =
    riskScore >= 70 ? 'critical' :
    riskScore >= 50 ? 'high'     :
    riskScore >= 25 ? 'medium'   : 'low';

  // ── Risk Flags
  const riskFlags: string[] = [];
  if (pct < 40)              riskFlags.push('Overall percentage below passing threshold (40%)');
  if (pct >= 40 && pct < 50) riskFlags.push('Performance in danger zone — borderline passing');
  if (attPct < 75)           riskFlags.push(`Attendance ${attPct.toFixed(1)}% — below 75% minimum`);
  if (failCount > 0)         riskFlags.push(`${failCount} subject(s) failed`);
  if (failCount >= 3)        riskFlags.push('Multiple subject failures — academic retention risk');

  // ── Trend: compare first term avg vs last term avg
  const termNums = [...new Set(card.exam_columns.map((c) => c.term_number))].sort((a, b) => a - b);
  let trend: StudentInsights['trend'] = 'stable';
  let trendDelta = 0;

  if (termNums.length >= 2) {
    const firstCols = card.exam_columns.filter((c) => c.term_number === termNums[0]);
    const lastCols  = card.exam_columns.filter((c) => c.term_number === termNums[termNums.length - 1]);
    const firstPct  = computeTermPct(firstCols, card.subjects);
    const lastPct   = computeTermPct(lastCols,  card.subjects);
    trendDelta = Math.round((lastPct - firstPct) * 10) / 10;
    trend = trendDelta > 5 ? 'improving' : trendDelta < -5 ? 'declining' : 'stable';
  }

  // ── Strong / Weak subjects
  const sorted = [...card.subjects].sort((a, b) => b.percentage - a.percentage);
  const strongSubjects: SubjectStat[] = sorted
    .filter((s) => s.percentage >= 70)
    .slice(0, 3)
    .map((s) => ({ name: s.subject_name, percentage: s.percentage, grade: s.grade }));
  const weakSubjects: SubjectStat[] = sorted
    .filter((s) => s.percentage < 50)
    .slice(-4)
    .reverse()
    .map((s) => ({ name: s.subject_name, percentage: s.percentage, grade: s.grade }));

  // ── Suggestions (rule-based)
  const suggestions: string[] = [];
  if (weakSubjects.length > 0) {
    suggestions.push(`Devote extra study time to: ${weakSubjects.slice(0, 2).map((s) => s.name).join(', ')}.`);
  }
  if (attPct < 75) {
    suggestions.push('Attendance is critically low. Ensure regular school presence immediately.');
  }
  if (trend === 'declining') {
    suggestions.push('Declining performance trend detected — schedule a parent-teacher meeting.');
  } else if (trend === 'improving' && pct < 60) {
    suggestions.push('Upward trend is encouraging — maintain this momentum with consistent revision.');
  }
  if (failCount === 0 && pct >= 85) {
    suggestions.push('Outstanding performance — explore olympiads or advanced elective subjects.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Maintain consistent study habits. Focus on weak areas with regular practice tests.');
  }

  // ── Predicted annual % (only when mid-year, not all terms present)
  let predictedAnnual: number | null = null;
  if (termNums.length === 1) {
    // Only one term done: conservative projection = current %
    predictedAnnual = Math.round(pct * 10) / 10;
  }

  return {
    risk_level: riskLevel,
    risk_score: riskScore,
    risk_flags: riskFlags,
    trend,
    trend_delta: trendDelta,
    weak_subjects: weakSubjects,
    strong_subjects: strongSubjects,
    suggestions,
    predicted_annual_percentage: predictedAnnual,
  };
}

// ─────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Build a complete FullReport for one student.
 * Combines progress card data with computed AI insights.
 */
export async function buildFullReport(
  studentId: string,
  academicYearId?: string,
  termId?: string,
): Promise<FullReport> {
  const card = await getProgressCard(studentId, academicYearId, termId);
  const insights = computeInsights(card);

  return {
    ...card,
    insights,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Retrieve all student IDs for a division in a given academic year,
 * ordered by roll number.
 */
export async function getStudentIdsForDivision(
  divisionId: string,
  academicYearId: string,
): Promise<Array<{ id: string; name: string; admission_number: string }>> {
  const { rows } = await pool.query<{ id: string; name: string; admission_number: string }>(
    `SELECT id, name, admission_number
     FROM students
     WHERE division_id = $1
       AND academic_year_id = $2
       AND is_active = TRUE
     ORDER BY roll_number`,
    [divisionId, academicYearId],
  );
  return rows;
}

/**
 * Build FullReports for every student in a division.
 * Yields one at a time to keep memory bounded during bulk PDF generation.
 */
export async function* buildDivisionReports(
  divisionId: string,
  academicYearId: string,
  termId?: string,
): AsyncGenerator<{ student: { name: string; admission_number: string }; report: FullReport; error?: never } | { student: { name: string; admission_number: string }; report?: never; error: string }> {
  const students = await getStudentIdsForDivision(divisionId, academicYearId);

  for (const student of students) {
    try {
      const report = await buildFullReport(student.id, academicYearId, termId);
      yield { student, report };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      yield { student, error: msg };
    }
  }
}

/**
 * Get consolidated report (delegates to reports-v2).
 * Exposed here so all report data flows through reportBuilder.
 */
export { getConsolidatedReportV2, getReportSettings, upsertReportSettings };
