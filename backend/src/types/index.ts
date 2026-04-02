// =============================================================
// KJSIS — Core TypeScript Types
// =============================================================

// ─── Enums (mirror DB enums) ─────────────────────────────────
export type UserRole = 'super_admin' | 'exam_cell' | 'teacher' | 'vp' | 'principal';
export type MarkStatus = 'draft' | 'submitted' | 'locked';
export type EntryMode = 'total' | 'component';
export type SubjectType = 'regular' | 'term_only';
export type ComponentType = 'TH' | 'PR' | 'IA';

// ─── Domain Models ───────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  mobile: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AcademicYear {
  id: string;
  label: string;
  start_date: Date;
  end_date: Date;
  is_current: boolean;
  created_at: Date;
}

export interface Class {
  id: string;
  grade_number: number;
  name: string;
  is_active: boolean;
  created_at: Date;
}

export interface Division {
  id: string;
  class_id: string;
  name: string;
  is_active: boolean;
  created_at: Date;
}

export interface Student {
  id: string;
  admission_number: string;
  name: string;
  roll_number: number;
  division_id: string;
  academic_year_id: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  class_id: string;
  subject_type: SubjectType;
  is_elective: boolean;
  elective_group: string | null;
  display_order: number;
  is_active: boolean;
  created_at: Date;
}

export interface StudentSubject {
  id: string;
  student_id: string;
  subject_id: string;
  created_at: Date;
}

export interface TeacherSubjectMap {
  id: string;
  teacher_id: string;
  division_id: string;
  subject_id: string;
  academic_year_id: string;
  is_active: boolean;
  created_at: Date;
}

export interface ClassTeacher {
  id: string;
  teacher_id: string;
  division_id: string;
  academic_year_id: string;
  is_active: boolean;
  created_at: Date;
}

export interface ExamType {
  id: string;
  academic_year_id: string;
  code: string;
  label: string;
  max_marks_default: number;
  passing_marks_default: number;
  entry_mode_default: EntryMode;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Term {
  id: string;
  academic_year_id: string;
  term_number: number;
  name: string;
  start_date: Date | null;
  end_date: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Exam {
  id: string;
  name: string;
  label: string | null;
  academic_year_id: string;
  term_id: string | null;
  exam_type_id: string | null;
  start_date: Date | null;
  end_date: Date | null;
  is_locked: boolean;
  is_active: boolean;
  created_at: Date;
}

// ─── Term-wise Progress (for student report cards) ────────────
export interface TermMark {
  exam_id: string;
  exam_name: string;
  exam_type_code: string;
  marks_obtained: number;
  total_marks: number;
  percentage: number;
  is_absent: boolean;
}

export interface TermProgress {
  term_id: string;
  term_number: number;
  term_name: string;
  exams: TermMark[];
  term_percentage: number;
  term_grade: string;
}

export interface StudentTermWiseProgress {
  student_id: string;
  student_name: string;
  subject_id: string;
  subject_name: string;
  terms: TermProgress[];
  overall_trend: 'improving' | 'declining' | 'stable';
}

export interface SubjectExamConfig {
  id: string;
  subject_id: string;
  exam_id: string;
  total_marks: number;
  passing_marks: number;
  entry_mode: EntryMode;
  is_active: boolean;
  created_at: Date;
}

export interface Component {
  id: string;
  subject_exam_config_id: string;
  component_type: ComponentType;
  max_marks: number;
  display_order: number;
  is_active: boolean;
  created_at: Date;
}

export interface Mark {
  id: string;
  student_id: string;
  subject_id: string;
  exam_id: string;
  component_id: string | null;
  teacher_id: string;
  marks_obtained: number;
  is_absent: boolean;
  status: MarkStatus;
  entered_at: Date;
  submitted_at: Date | null;
  locked_at: Date | null;
  updated_at: Date;
}

export interface Attendance {
  id: string;
  student_id: string;
  division_id: string;
  date: Date;
  reason: string | null;
  marked_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkingDay {
  id: string;
  division_id: string | null;
  date: Date;
  is_working: boolean;
  override_reason: string | null;
  created_by: string;
  created_at: Date;
}

// ─── JWT Payload ─────────────────────────────────────────────
export interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ─── Request Augmentation ────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── API Response Shapes ─────────────────────────────────────
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Paginated Response ──────────────────────────────────────
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Mark Entry DTOs ─────────────────────────────────────────
export interface MarkEntryRow {
  student_id: string;
  marks_obtained: number;
  is_absent?: boolean;
}

export interface ComponentMarkEntryRow {
  student_id: string;
  component_id: string;
  marks_obtained: number;
  is_absent?: boolean;
}

// ─── Teacher Dashboard ───────────────────────────────────────
export interface TeacherSubjectCard {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  class_name: string;
  division_name: string;
  division_id: string;
}

// ─── Attendance Summary ──────────────────────────────────────
export interface AttendanceSummary {
  student_id: string;
  student_name: string;
  roll_number: number;
  total_working_days: number;
  total_absent: number;
  attendance_percentage: number;
}

// ─── Term-wise Trend (AI Engine) ─────────────────────────────
export interface TermTrendPoint {
  term_number: number;
  term_name: string;
  avg_percentage: number;
  pass_rate: number;
  student_count: number;
}

export interface TermTrendAnalysis {
  subject_id: string;
  subject_name: string;
  division_id: string;
  trend_points: TermTrendPoint[];
  trend_direction: 'improving' | 'declining' | 'stable';
  delta_first_last: number;  // percentage points between first and last term
}

// ─── Generated Exam Preview ──────────────────────────────────
export interface GeneratedExamPreview {
  name: string;
  label: string;
  term_number: number;
  exam_type_code: string;
  max_marks: number;
}

// ─── Phase 4: Report Config ───────────────────────────────────
export interface ReportSettings {
  id: string;
  academic_year_id: string;
  school_name: string;
  logo_url: string | null;
  principal_name: string | null;
  show_rank: boolean;
  show_attendance: boolean;
  show_insights: boolean;
  show_ai_remarks: boolean;
  footer_text: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportRemark {
  id: string;
  student_id: string;
  academic_year_id: string;
  term_id: string | null;
  remark_text: string;
  is_ai_generated: boolean;
  edited_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Phase 4: Progress Card ───────────────────────────────────
export interface ProgressCardExamColumn {
  exam_id: string;
  exam_name: string;       // "MT1", "IA1", "TERM1"
  exam_label: string;      // "Mid Term 1"
  exam_type_code: string;  // "MT", "IA", "TERM"
  term_number: number;
  max_marks: number;
}

export interface ProgressCardMarkCell {
  marks_obtained: number | null;
  is_absent: boolean;
}

export interface ProgressCardSubjectRow {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  display_order: number;
  marks: Record<string, ProgressCardMarkCell>;  // keyed by exam_id
  total_obtained: number;
  total_max: number;
  percentage: number;
  grade: string;
  is_passing: boolean;
}

export interface ProgressCardTotals {
  obtained: number;
  max: number;
  percentage: number;
  grade: string;
  rank: number | null;
  total_students: number;
  subjects_passed: number;
  subjects_failed: number;
}

export interface ProgressCardStudentInfo {
  id: string;
  name: string;
  admission_number: string;
  roll_number: number;
  class_name: string;
  division_name: string;
}

export interface ProgressCardRemark {
  term_id: string | null;
  term_name: string | null;
  remark_text: string;
  is_ai_generated: boolean;
}

export interface ProgressCardData {
  student: ProgressCardStudentInfo;
  academic_year: { id: string; label: string };
  settings: ReportSettings;
  exam_columns: ProgressCardExamColumn[];  // ordered columns for the table
  subjects: ProgressCardSubjectRow[];
  totals: ProgressCardTotals;
  attendance: { total_working_days: number; total_absent: number; percentage: number } | null;
  remarks: ProgressCardRemark[];
}

// ─── Phase 4: Consolidated Report ────────────────────────────
export interface ConsolidatedStudentRow {
  student_id: string;
  student_name: string;
  admission_number: string;
  roll_number: number;
  subject_totals: Record<string, { obtained: number; max: number; percentage: number; grade: string }>;
  grand_total_obtained: number;
  grand_total_max: number;
  grand_percentage: number;
  grand_grade: string;
  rank: number;
  subjects_passed: number;
  subjects_failed: number;
}

export interface ConsolidatedReportSubjectHeader {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  display_order: number;
  max_marks: number;  // total across selected exams
}

export interface ConsolidatedReport {
  division_id: string;
  class_name: string;
  division_name: string;
  academic_year: { id: string; label: string };
  exam_ids: string[];  // which exams included
  subject_headers: ConsolidatedReportSubjectHeader[];
  students: ConsolidatedStudentRow[];
  class_averages: Record<string, number>;  // subject_id → avg %
  class_pass_rates: Record<string, number>;
}
