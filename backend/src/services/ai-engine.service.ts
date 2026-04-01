// =============================================================
// KJSIS — AI Insights Engine (7 Intelligence Modules)
//
// Module 1: Risk Detection       — fail probability per student
// Module 2: Trend Analysis       — compare last 3 exams
// Module 3: Subject Weakness     — school-wide weak subjects
// Module 4: Teacher Effectiveness— student improvement correlation
// Module 5: Attendance Risk      — < 75% flag + projection
// Module 6: Recommendation Engine— actionable steps
// Module 7: Consequence Engine   — predict impact if no action
// =============================================================

import { query } from '../utils/db';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────
export interface RiskProfile {
  student_id: string;
  student_name: string;
  roll_number: number;
  class_name: string;
  division_name: string;
  risk_score: number;          // 0–100: higher = more at risk
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  avg_marks_pct: number;
  attendance_pct: number;
  fail_count: number;
  weak_subjects: string[];
}

export interface TrendData {
  student_id: string;
  student_name: string;
  subject_name: string;
  exam_trend: Array<{ exam_name: string; marks_pct: number }>;
  trend_direction: 'improving' | 'declining' | 'stable';
  change_pct: number;          // % change from first to last exam
}

export interface SubjectWeakness {
  subject_name: string;
  class_name: string;
  division_name: string;
  avg_marks_pct: number;
  fail_rate_pct: number;
  total_students: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TeacherEffectiveness {
  teacher_id: string;
  teacher_name: string;
  subject_name: string;
  class_name: string;
  division_name: string;
  avg_improvement_pct: number;   // average % improvement across students
  effectiveness_score: number;   // 0–100
  rating: 'needs_support' | 'average' | 'good' | 'excellent';
}

export interface AttendanceRisk {
  student_id: string;
  student_name: string;
  division_name: string;
  class_name: string;
  current_attendance_pct: number;
  projected_end_pct: number;
  days_remaining: number;
  max_more_absences_allowed: number;
  risk_level: 'safe' | 'warning' | 'danger' | 'critical';
}

export interface Insight {
  module: string;
  severity: 'info' | 'warning' | 'danger' | 'critical';
  issue: string;
  affected_count: number;
  recommendation: string;
  consequence: string;
  action_deadline?: string;
  metadata?: Record<string, unknown>;
}

export interface AIInsightReport {
  generated_at: string;
  academic_year: string;
  summary: {
    total_at_risk: number;
    total_attendance_alerts: number;
    weak_subjects_count: number;
    critical_students: number;
  };
  insights: Insight[];
  risk_profiles: RiskProfile[];
  attendance_risks: AttendanceRisk[];
  subject_weaknesses: SubjectWeakness[];
  teacher_effectiveness: TeacherEffectiveness[];
  trends: TrendData[];
  term_trends: import('../types').TermTrendAnalysis[];
}

// ─── Thresholds (configurable via env) ───────────────────────
const MARK_RISK_THRESHOLD   = parseFloat(process.env.AI_MARK_THRESHOLD   ?? '40');
const ATTEND_RISK_THRESHOLD = parseFloat(process.env.AI_ATTEND_THRESHOLD ?? '75');
const TREND_EXAM_COUNT      = parseInt(process.env.AI_TREND_EXAMS        ?? '3');

// ─── Risk Score Calculator ────────────────────────────────────
const calcRiskScore = (avgMarksPct: number, attendancePct: number, failCount: number): number => {
  // Weighted formula: marks 50%, attendance 30%, fail history 20%
  const markRisk    = Math.max(0, 100 - avgMarksPct);
  const attendRisk  = Math.max(0, 100 - attendancePct);
  const failRisk    = Math.min(100, failCount * 20);
  return Math.round(markRisk * 0.5 + attendRisk * 0.3 + failRisk * 0.2);
};

const riskLevel = (score: number): RiskProfile['risk_level'] => {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
};

// =============================================================
// MODULE 1: Risk Detection — full risk profiles
// =============================================================
export const getRiskProfiles = async (divisionId?: string): Promise<RiskProfile[]> => {
  const divFilter = divisionId ? `AND s.division_id = '${divisionId}'` : '';

  const result = await query<{
    student_id: string;
    student_name: string;
    roll_number: number;
    class_name: string;
    division_name: string;
    avg_marks_pct: string;
    total_absent: string;
    total_working_days: string;
    fail_count: string;
    weak_subjects: string;
  }>(
    `WITH student_marks AS (
       SELECT
         m.student_id,
         ROUND(
           AVG((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100), 1
         ) AS avg_marks_pct,
         COUNT(*) FILTER (
           WHERE m.marks_obtained < sec.passing_marks AND NOT m.is_absent
         ) AS fail_count,
         STRING_AGG(
           CASE WHEN m.marks_obtained < sec.passing_marks AND NOT m.is_absent
                THEN subj.name ELSE NULL END, ', '
         ) AS weak_subjects
       FROM marks m
       JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
       JOIN subjects subj ON m.subject_id = subj.id
       JOIN exams e ON m.exam_id = e.id
       JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE ay.is_current = TRUE AND m.component_id IS NULL
       GROUP BY m.student_id
     ),
     student_attendance AS (
       SELECT
         s.id AS student_id,
         COUNT(a.id) AS total_absent,
         (
           SELECT COUNT(*) FROM generate_series(ay.start_date, CURRENT_DATE, '1 day') AS d
           WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
         ) AS total_working_days
       FROM students s
       JOIN academic_years ay ON s.academic_year_id = ay.id
       LEFT JOIN attendance a ON a.student_id = s.id
       WHERE s.is_active = TRUE AND ay.is_current = TRUE
       GROUP BY s.id, ay.start_date
     )
     SELECT
       s.id           AS student_id,
       s.name         AS student_name,
       s.roll_number,
       c.name         AS class_name,
       d.name         AS division_name,
       COALESCE(sm.avg_marks_pct, 0)    AS avg_marks_pct,
       COALESCE(sa.total_absent, 0)     AS total_absent,
       COALESCE(sa.total_working_days, 1) AS total_working_days,
       COALESCE(sm.fail_count, 0)       AS fail_count,
       COALESCE(sm.weak_subjects, '')   AS weak_subjects
     FROM students s
     JOIN divisions d ON s.division_id = d.id
     JOIN classes   c ON d.class_id    = c.id
     JOIN academic_years ay ON s.academic_year_id = ay.id
     LEFT JOIN student_marks sm ON sm.student_id = s.id
     LEFT JOIN student_attendance sa ON sa.student_id = s.id
     WHERE s.is_active = TRUE AND ay.is_current = TRUE ${divFilter}
     ORDER BY c.grade_number, d.name, s.roll_number`,
  );

  return result.rows.map((r) => {
    const avgMarksPct   = parseFloat(r.avg_marks_pct);
    const absent        = parseInt(r.total_absent);
    const workingDays   = parseInt(r.total_working_days);
    const attendancePct = workingDays > 0
      ? Math.round(((workingDays - absent) / workingDays) * 100 * 10) / 10
      : 100;
    const failCount     = parseInt(r.fail_count);
    const score         = calcRiskScore(avgMarksPct, attendancePct, failCount);

    return {
      student_id:      r.student_id,
      student_name:    r.student_name,
      roll_number:     r.roll_number,
      class_name:      r.class_name,
      division_name:   r.division_name,
      risk_score:      score,
      risk_level:      riskLevel(score),
      avg_marks_pct:   avgMarksPct,
      attendance_pct:  attendancePct,
      fail_count:      failCount,
      weak_subjects:   r.weak_subjects ? r.weak_subjects.split(', ').filter(Boolean) : [],
    };
  });
};

// =============================================================
// MODULE 2: Trend Analysis — last N exams per student
// =============================================================
export const getTrendAnalysis = async (
  divisionId: string,
  subjectId?: string,
): Promise<TrendData[]> => {
  const subjFilter = subjectId ? `AND m.subject_id = '${subjectId}'` : '';

  const result = await query(
    `SELECT
       s.id            AS student_id,
       s.name          AS student_name,
       subj.name       AS subject_name,
       e.name          AS exam_name,
       e.start_date,
       ROUND((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100, 1) AS marks_pct
     FROM marks m
     JOIN students s ON m.student_id = s.id
     JOIN subjects subj ON m.subject_id = subj.id
     JOIN exams e ON m.exam_id = e.id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
     JOIN academic_years ay ON e.academic_year_id = ay.id
     WHERE s.division_id = $1
       AND s.is_active   = TRUE
       AND ay.is_current = TRUE
       AND m.component_id IS NULL
       AND NOT m.is_absent ${subjFilter}
     ORDER BY s.id, subj.id, e.start_date`,
    [divisionId],
  );

  // Group by student + subject
  const grouped = new Map<string, TrendData>();

  for (const row of result.rows) {
    const key = `${row.student_id}::${row.subject_name}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        student_id:   row.student_id,
        student_name: row.student_name,
        subject_name: row.subject_name,
        exam_trend:   [],
        trend_direction: 'stable',
        change_pct:   0,
      });
    }
    const entry = grouped.get(key)!;
    entry.exam_trend.push({
      exam_name: row.exam_name,
      marks_pct: parseFloat(row.marks_pct),
    });
  }

  // Compute direction using last N exams
  for (const entry of grouped.values()) {
    const exams = entry.exam_trend.slice(-TREND_EXAM_COUNT);
    if (exams.length < 2) { entry.trend_direction = 'stable'; continue; }

    const first = exams[0].marks_pct;
    const last  = exams[exams.length - 1].marks_pct;
    entry.change_pct = Math.round((last - first) * 10) / 10;

    if (entry.change_pct > 5)       entry.trend_direction = 'improving';
    else if (entry.change_pct < -5) entry.trend_direction = 'declining';
    else                            entry.trend_direction = 'stable';
  }

  return Array.from(grouped.values());
};

// =============================================================
// MODULE 3: Subject Weakness — school-wide
// =============================================================
export const getSubjectWeaknesses = async (): Promise<SubjectWeakness[]> => {
  const result = await query<{
    subject_name: string;
    class_name: string;
    division_name: string;
    avg_marks_pct: string;
    fail_rate_pct: string;
    total_students: string;
  }>(
    `SELECT
       subj.name       AS subject_name,
       c.name          AS class_name,
       d.name          AS division_name,
       ROUND(AVG((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100) FILTER (WHERE NOT m.is_absent), 1) AS avg_marks_pct,
       ROUND(
         COUNT(*) FILTER (WHERE m.marks_obtained < sec.passing_marks AND NOT m.is_absent)::numeric
         / NULLIF(COUNT(*) FILTER (WHERE NOT m.is_absent), 0) * 100, 1
       ) AS fail_rate_pct,
       COUNT(DISTINCT m.student_id) AS total_students
     FROM marks m
     JOIN students s ON m.student_id = s.id
     JOIN divisions d ON s.division_id = d.id
     JOIN classes   c ON d.class_id    = c.id
     JOIN subjects subj ON m.subject_id = subj.id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
     JOIN exams e ON m.exam_id = e.id
     JOIN academic_years ay ON e.academic_year_id = ay.id
     WHERE ay.is_current = TRUE AND m.component_id IS NULL AND s.is_active = TRUE
     GROUP BY subj.name, c.name, c.grade_number, d.name, d.id
     ORDER BY fail_rate_pct DESC NULLS LAST`,
  );

  return result.rows.map((r) => {
    const failRate = parseFloat(r.fail_rate_pct ?? '0');
    const avgPct   = parseFloat(r.avg_marks_pct ?? '0');
    let severity: SubjectWeakness['severity'] = 'low';
    if (failRate >= 50 || avgPct < 40)      severity = 'critical';
    else if (failRate >= 35 || avgPct < 50) severity = 'high';
    else if (failRate >= 20 || avgPct < 60) severity = 'medium';

    return {
      subject_name:    r.subject_name,
      class_name:      r.class_name,
      division_name:   r.division_name,
      avg_marks_pct:   avgPct,
      fail_rate_pct:   failRate,
      total_students:  parseInt(r.total_students),
      severity,
    };
  });
};

// =============================================================
// MODULE 4: Teacher Effectiveness
// Compares student improvement between consecutive exams
// =============================================================
export const getTeacherEffectiveness = async (): Promise<TeacherEffectiveness[]> => {
  const result = await query<{
    teacher_id: string;
    teacher_name: string;
    subject_name: string;
    class_name: string;
    division_name: string;
    avg_improvement: string;
  }>(
    `WITH ordered_exams AS (
       SELECT
         tsm.teacher_id,
         m.student_id,
         m.subject_id,
         e.id AS exam_id,
         e.start_date,
         ROUND((m.marks_obtained / NULLIF(sec.total_marks, 0)) * 100, 1) AS marks_pct,
         ROW_NUMBER() OVER (
           PARTITION BY tsm.teacher_id, m.student_id, m.subject_id
           ORDER BY e.start_date
         ) AS rn
       FROM marks m
       JOIN teacher_subject_map tsm
         ON tsm.subject_id = m.subject_id AND tsm.teacher_id = m.teacher_id
       JOIN exams e ON m.exam_id = e.id
       JOIN subject_exam_config sec ON sec.subject_id = m.subject_id AND sec.exam_id = m.exam_id
       JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE ay.is_current = TRUE AND m.component_id IS NULL AND NOT m.is_absent
     ),
     improvements AS (
       SELECT
         curr.teacher_id,
         curr.subject_id,
         AVG(curr.marks_pct - prev.marks_pct) AS avg_improvement
       FROM ordered_exams curr
       JOIN ordered_exams prev
         ON curr.teacher_id  = prev.teacher_id
        AND curr.student_id  = prev.student_id
        AND curr.subject_id  = prev.subject_id
        AND curr.rn          = prev.rn + 1
       GROUP BY curr.teacher_id, curr.subject_id
     )
     SELECT
       u.id              AS teacher_id,
       u.name            AS teacher_name,
       subj.name         AS subject_name,
       c.name            AS class_name,
       d.name            AS division_name,
       ROUND(i.avg_improvement, 2) AS avg_improvement
     FROM improvements i
     JOIN users u ON i.teacher_id = u.id
     JOIN subjects subj ON i.subject_id = subj.id
     JOIN teacher_subject_map tsm
       ON tsm.teacher_id = i.teacher_id AND tsm.subject_id = i.subject_id
     JOIN divisions d ON tsm.division_id = d.id
     JOIN classes   c ON d.class_id      = c.id
     JOIN academic_years ay ON tsm.academic_year_id = ay.id
     WHERE ay.is_current = TRUE AND tsm.is_active = TRUE
     ORDER BY i.avg_improvement DESC`,
  );

  return result.rows.map((r) => {
    const improvement = parseFloat(r.avg_improvement ?? '0');
    // Score: normalise improvement from -20..+20 to 0..100
    const score = Math.min(100, Math.max(0, Math.round((improvement + 20) / 40 * 100)));
    let rating: TeacherEffectiveness['rating'] = 'average';
    if (score >= 75)      rating = 'excellent';
    else if (score >= 55) rating = 'good';
    else if (score < 35)  rating = 'needs_support';

    return {
      teacher_id:           r.teacher_id,
      teacher_name:         r.teacher_name,
      subject_name:         r.subject_name,
      class_name:           r.class_name,
      division_name:        r.division_name,
      avg_improvement_pct:  improvement,
      effectiveness_score:  score,
      rating,
    };
  });
};

// =============================================================
// MODULE 5: Attendance Risk — projected end-of-year %
// =============================================================
export const getAttendanceRisk = async (divisionId?: string): Promise<AttendanceRisk[]> => {
  const divFilter = divisionId ? `AND s.division_id = '${divisionId}'` : '';

  const result = await query<{
    student_id: string;
    student_name: string;
    division_name: string;
    class_name: string;
    total_absent: string;
    days_elapsed: string;
    total_year_days: string;
  }>(
    `SELECT
       s.id    AS student_id,
       s.name  AS student_name,
       d.name  AS division_name,
       c.name  AS class_name,
       COUNT(a.id) AS total_absent,
       -- Working days elapsed so far (Mon–Fri only, simple approximation)
       (CURRENT_DATE - ay.start_date) * 5 / 7 AS days_elapsed,
       -- Full year working days
       (ay.end_date - ay.start_date) * 5 / 7  AS total_year_days
     FROM students s
     JOIN academic_years ay ON s.academic_year_id = ay.id
     JOIN divisions d ON s.division_id = d.id
     JOIN classes   c ON d.class_id    = c.id
     LEFT JOIN attendance a ON a.student_id = s.id
     WHERE s.is_active = TRUE AND ay.is_current = TRUE ${divFilter}
     GROUP BY s.id, s.name, d.name, c.name, ay.start_date, ay.end_date
     ORDER BY c.grade_number, d.name, s.roll_number`,
  );

  return result.rows.map((r) => {
    const absent       = parseInt(r.total_absent);
    const elapsed      = Math.max(parseInt(r.days_elapsed), 1);
    const totalYear    = Math.max(parseInt(r.total_year_days), elapsed);
    const remaining    = totalYear - elapsed;
    const presentSoFar = elapsed - absent;
    const currentPct   = Math.round((presentSoFar / elapsed) * 100 * 10) / 10;

    // Project: assume same rate of absence for remaining days
    const projectedAbsent     = absent + Math.round((absent / elapsed) * remaining);
    const projectedPresent    = totalYear - projectedAbsent;
    const projectedEndPct     = Math.round((projectedPresent / totalYear) * 100 * 10) / 10;

    // Max absences still allowed before dropping below 75%
    const minRequired         = Math.ceil(totalYear * 0.75);
    const maxMoreAbsences     = Math.max(0, presentSoFar + remaining - minRequired);

    let riskLevelValue: AttendanceRisk['risk_level'] = 'safe';
    if (currentPct < 65 || projectedEndPct < 65)      riskLevelValue = 'critical';
    else if (currentPct < 72 || projectedEndPct < 72) riskLevelValue = 'danger';
    else if (currentPct < ATTEND_RISK_THRESHOLD)       riskLevelValue = 'warning';

    return {
      student_id:                r.student_id,
      student_name:              r.student_name,
      division_name:             r.division_name,
      class_name:                r.class_name,
      current_attendance_pct:    currentPct,
      projected_end_pct:         projectedEndPct,
      days_remaining:            remaining,
      max_more_absences_allowed: maxMoreAbsences,
      risk_level:                riskLevelValue,
    };
  }).filter((r) => r.risk_level !== 'safe');
};

// =============================================================
// MODULE 6 + 7: Recommendation + Consequence Engine
// =============================================================
const buildInsights = (
  riskProfiles: RiskProfile[],
  weaknesses: SubjectWeakness[],
  attendance: AttendanceRisk[],
  effectiveness: TeacherEffectiveness[],
): Insight[] => {
  const insights: Insight[] = [];

  // ── Critical students ───────────────────────────────────────
  const critical  = riskProfiles.filter((r) => r.risk_level === 'critical');
  const highRisk  = riskProfiles.filter((r) => r.risk_level === 'high');

  if (critical.length > 0) {
    insights.push({
      module:           'Risk Detection',
      severity:         'critical',
      issue:            `${critical.length} student(s) are at CRITICAL academic risk`,
      affected_count:   critical.length,
      recommendation:   'Schedule immediate one-on-one counselling and parent meetings. Assign remedial sessions for flagged subjects.',
      consequence:      `If no action is taken, ${Math.round(critical.length * 0.8)} of these students are likely to fail their term exam, leading to detention or re-test proceedings.`,
      metadata:         { student_ids: critical.map((s) => s.student_id) },
    });
  }

  if (highRisk.length > 0) {
    insights.push({
      module:           'Risk Detection',
      severity:         'danger',
      issue:            `${highRisk.length} student(s) are at HIGH academic risk`,
      affected_count:   highRisk.length,
      recommendation:   'Conduct weekly progress check-ins. Share performance data with parents.',
      consequence:      `Without intervention, approximately ${Math.round(highRisk.length * 0.5)} may fail 2+ subjects this term.`,
    });
  }

  // ── Subject weaknesses ──────────────────────────────────────
  const criticalSubjects = weaknesses.filter((w) => w.severity === 'critical');
  const highSubjects     = weaknesses.filter((w) => w.severity === 'high');

  for (const subj of criticalSubjects) {
    insights.push({
      module:           'Subject Weakness',
      severity:         'critical',
      issue:            `${subj.fail_rate_pct}% fail rate in ${subj.subject_name} — ${subj.class_name} ${subj.division_name}`,
      affected_count:   Math.round(subj.total_students * subj.fail_rate_pct / 100),
      recommendation:   `Conduct a targeted remedial programme for ${subj.subject_name}. Review teaching methodology and resource gaps.`,
      consequence:      `If fail rate is not reduced, board exam results will be significantly impacted. School ranking may drop by an estimated 15–20 positions.`,
      metadata:         { subject: subj.subject_name, class: subj.class_name, division: subj.division_name },
    });
  }

  if (highSubjects.length > 0) {
    insights.push({
      module:           'Subject Weakness',
      severity:         'warning',
      issue:            `${highSubjects.length} subject(s) have above-average fail rates`,
      affected_count:   highSubjects.length,
      recommendation:   'Review question paper difficulty and teaching pace for flagged subjects.',
      consequence:      'Continued underperformance may lower overall class averages and affect student morale.',
    });
  }

  // ── Attendance risks ─────────────────────────────────────────
  const criticalAttend = attendance.filter((a) => a.risk_level === 'critical');
  const dangerAttend   = attendance.filter((a) => a.risk_level === 'danger');

  if (criticalAttend.length > 0) {
    insights.push({
      module:           'Attendance Risk',
      severity:         'critical',
      issue:            `${criticalAttend.length} student(s) have attendance below 65% and are at risk of being debarred`,
      affected_count:   criticalAttend.length,
      recommendation:   'Issue formal notice to parents. Class teacher to meet guardians within 3 working days.',
      consequence:      `Students below 65% attendance may be debarred from exams per school policy, directly impacting pass rates and school metrics.`,
      metadata:         { student_ids: criticalAttend.map((a) => a.student_id) },
    });
  }

  if (dangerAttend.length > 0) {
    insights.push({
      module:           'Attendance Risk',
      severity:         'danger',
      issue:            `${dangerAttend.length} student(s) projected to drop below 75% by year end`,
      affected_count:   dangerAttend.length,
      recommendation:   'Send SMS/written warning to parents. Monitor weekly.',
      consequence:      'Students dropping below 75% lose eligibility for certain academic privileges and scholarships.',
    });
  }

  // ── Teacher effectiveness ────────────────────────────────────
  const needsSupport = effectiveness.filter((t) => t.rating === 'needs_support');
  if (needsSupport.length > 0) {
    insights.push({
      module:           'Teacher Effectiveness',
      severity:         'warning',
      issue:            `${needsSupport.length} teacher-subject combination(s) show declining student performance`,
      affected_count:   needsSupport.length,
      recommendation:   'Schedule peer observation sessions. Provide targeted professional development. Discuss syllabus pacing.',
      consequence:      'Persistent underperformance can widen the learning gap, making it harder to recover before board/term exams.',
      metadata:         { teachers: needsSupport.map((t) => ({ name: t.teacher_name, subject: t.subject_name })) },
    });
  }

  // Sort by severity
  const order = { critical: 0, danger: 1, warning: 2, info: 3 };
  return insights.sort((a, b) => order[a.severity] - order[b.severity]);
};

// =============================================================
// Module 8: Term-wise Trend Analysis
// Groups exam performance by term, detects cross-term trajectory
// =============================================================
export const getTermTrendAnalysis = async (
  divisionId?: string,
): Promise<import('../types').TermTrendAnalysis[]> => {
  const result = await query<{
    subject_id:   string;
    subject_name: string;
    division_id:  string;
    term_number:  number;
    term_name:    string;
    avg_pct:      number;
    pass_rate:    number;
    student_count: number;
  }>(
    `SELECT
       sub.id            AS subject_id,
       sub.name          AS subject_name,
       d.id              AS division_id,
       t.term_number,
       t.name            AS term_name,
       ROUND(AVG((m.marks_obtained::numeric / NULLIF(sec.total_marks,0)) * 100), 1) AS avg_pct,
       ROUND(
         COUNT(*) FILTER (
           WHERE (m.marks_obtained::numeric / NULLIF(sec.total_marks,0)) * 100 >= 35
         )::numeric / NULLIF(COUNT(*), 0) * 100, 1
       ) AS pass_rate,
       COUNT(DISTINCT m.student_id) AS student_count
     FROM marks m
     JOIN exams               e   ON e.id  = m.exam_id
     JOIN terms               t   ON t.id  = e.term_id
     JOIN subjects            sub ON sub.id = m.subject_id
     JOIN subject_exam_config sec ON sec.subject_id = m.subject_id
                                  AND sec.exam_id   = m.exam_id
     JOIN students            s   ON s.id  = m.student_id
     JOIN divisions           d   ON d.id  = s.division_id
     JOIN academic_years      ay  ON ay.id = e.academic_year_id
     WHERE ay.is_current    = TRUE
       AND m.component_id IS NULL
       AND m.status IN ('submitted','locked')
       ${divisionId ? `AND d.id = '${divisionId}'` : ''}
     GROUP BY sub.id, sub.name, d.id, t.term_number, t.name
     ORDER BY sub.name, d.id, t.term_number`,
    [],
  );

  // Group by subject+division
  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const key = `${row.subject_id}|${row.division_id}`;
    const arr = grouped.get(key) ?? [];
    arr.push(row);
    grouped.set(key, arr);
  }

  const output: import('../types').TermTrendAnalysis[] = [];

  for (const [, rows] of grouped.entries()) {
    const trendPoints: import('../types').TermTrendPoint[] = rows.map((r) => ({
      term_number:   r.term_number,
      term_name:     r.term_name,
      avg_percentage: parseFloat(r.avg_pct as unknown as string),
      pass_rate:     parseFloat(r.pass_rate as unknown as string),
      student_count: r.student_count,
    }));

    const first = trendPoints[0]?.avg_percentage ?? 0;
    const last  = trendPoints[trendPoints.length - 1]?.avg_percentage ?? 0;
    const delta = last - first;

    let direction: 'improving' | 'declining' | 'stable' = 'stable';
    if (trendPoints.length >= 2) {
      if (delta >= 5)       direction = 'improving';
      else if (delta <= -5) direction = 'declining';
    }

    output.push({
      subject_id:       rows[0].subject_id,
      subject_name:     rows[0].subject_name,
      division_id:      rows[0].division_id,
      trend_points:     trendPoints,
      trend_direction:  direction,
      delta_first_last: Math.round(delta * 10) / 10,
    });
  }

  // Sort: most-declining first (highest urgency)
  return output.sort((a, b) => a.delta_first_last - b.delta_first_last);
};

// =============================================================
// MAIN: Generate full AI insight report
// =============================================================
export const generateInsightReport = async (divisionId?: string): Promise<AIInsightReport> => {
  logger.info('Generating AI insight report', { divisionId });

  const [riskProfiles, weaknesses, attendanceRisks, effectiveness, trends, termTrends] =
    await Promise.all([
      getRiskProfiles(divisionId),
      getSubjectWeaknesses(),
      getAttendanceRisk(divisionId),
      getTeacherEffectiveness(),
      divisionId ? getTrendAnalysis(divisionId) : Promise.resolve([]),
      getTermTrendAnalysis(divisionId),
    ]);

  const insights = buildInsights(riskProfiles, weaknesses, attendanceRisks, effectiveness);

  // Get current academic year label
  const yearResult = await query<{ label: string }>(
    `SELECT label FROM academic_years WHERE is_current = TRUE LIMIT 1`,
  );

  return {
    generated_at:     new Date().toISOString(),
    academic_year:    yearResult.rows[0]?.label ?? 'Unknown',
    summary: {
      total_at_risk:           riskProfiles.filter((r) => r.risk_level !== 'low').length,
      total_attendance_alerts: attendanceRisks.length,
      weak_subjects_count:     weaknesses.filter((w) => w.severity !== 'low').length,
      critical_students:       riskProfiles.filter((r) => r.risk_level === 'critical').length,
    },
    insights,
    risk_profiles:         riskProfiles.filter((r) => r.risk_level !== 'low'),
    attendance_risks:      attendanceRisks,
    subject_weaknesses:    weaknesses.filter((w) => w.severity !== 'low'),
    teacher_effectiveness: effectiveness,
    trends,
    term_trends:           termTrends,
  };
};
